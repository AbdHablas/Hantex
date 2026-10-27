import { documentVersions, users, type DocumentKind } from '@hantex/db/worker';
import { brandTheme, publishable, validateTheme, type Theme } from '@hantex/theme';
import type { Permission } from '@hantex/shared';
import { and, desc, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { AppEnv } from '../context';
import { writeAudit } from '../lib/audit';
import { startRebuild } from '../lib/rebuild';
import {
  DOCUMENTS,
  KINDS,
  currentDraft,
  latestPublished,
  publishVersion,
  saveDraft,
} from '../lib/documents';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { requireThemeFonts } from '../lib/fonts';
import { validate } from '../lib/validate';

const kindParam = validate('param', z.object({ kind: z.enum(KINDS) }));
const auditActor = (v: AppEnv['Variables']) => ({ userId: v.access.userId, label: v.access.email });

function requireAll(v: AppEnv['Variables'], permissions: readonly Permission[]) {
  const missing = permissions.filter((p) => !v.permissions.has(p));
  if (missing.length > 0) throw forbidden('missing-permission', { missing });
}

const logoOf = (theme: Theme) => JSON.stringify(theme.logo);
const isBrandLogo = (theme: Theme) => logoOf(theme) === logoOf(brandTheme);

/** Logo colours are brand-sensitive (D-022): changing or publishing off-brand colours needs its own permission. */
function guardLogo(v: AppEnv['Variables'], theme: Theme, confirmed: boolean) {
  if (isBrandLogo(theme)) return;
  if (!v.permissions.has('appearance.editLogo')) throw forbidden('logo-colours-locked');
  if (!confirmed) throw conflict('confirm-logo-change');
}

async function publish(
  c: Context<AppEnv>,
  kind: DocumentKind,
  data: unknown,
  restoredFrom: number | null,
) {
  const v = c.var;
  const version = await publishVersion(v.db, v.site.id, kind, data, v.access.userId, restoredFrom);
  const { job, result } = await startRebuild(c);
  await writeAudit(
    v.db,
    auditActor(v),
    {
      action: restoredFrom ? 'document.rolled-back' : 'document.published',
      siteId: v.site.id,
      targetType: 'document',
      targetId: kind,
      details: { version, ...(restoredFrom ? { restoredFrom } : {}), build: result.detail },
    },
    v.requestId,
  );
  return {
    version,
    job: job ? { id: job.id, dispatched: result.dispatched, detail: result.detail } : null,
  };
}

/**
 * One site's drafts, publishing, history and rollback: Coming Soon content, settings, theme and
 * logo.
 */
export const documentRoutes = new Hono<AppEnv>()
  .get('/:kind', kindParam, async (c) => {
    const { kind } = c.req.valid('param');
    requireAll(c.var, DOCUMENTS[kind].view);
    const draft = await currentDraft(c.var.db, c.var.site.id, kind);
    const published = await latestPublished(c.var.db, c.var.site.id, kind);
    return c.json({
      draft: draft.data,
      draftUpdatedAt: draft.updatedAt,
      published: published
        ? { version: published.version, publishedAt: published.publishedAt }
        : null,
      ...(kind === 'theme' ? { checks: validateTheme(draft.data as Theme) } : {}),
    });
  })

  // A logo draft holds two SVG files of up to 200,000 characters each; nothing else comes close.
  .put(
    '/:kind/draft',
    kindParam,
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: () => {
        throw badRequest('too-large');
      },
    }),
    async (c) => {
      const { kind } = c.req.valid('param');
      const v = c.var;
      requireAll(v, DOCUMENTS[kind].edit);
      const parsed = DOCUMENTS[kind].schema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        throw badRequest('invalid-input', {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
        });
      }
      if (kind === 'theme') {
        const next = parsed.data as Theme;
        const previous = (await currentDraft(v.db, v.site.id, kind)).data as Theme;
        if (logoOf(next) !== logoOf(previous) && !v.permissions.has('appearance.editLogo')) {
          throw forbidden('logo-colours-locked');
        }
        // Uploaded fonts must exist and write the script they're chosen for (D-033).
        await requireThemeFonts(v.db, next);
      }
      await saveDraft(v.db, v.site.id, kind, parsed.data, v.access.userId);
      await writeAudit(
        v.db,
        auditActor(v),
        {
          action: 'document.draft-saved',
          siteId: v.site.id,
          targetType: 'document',
          targetId: kind,
        },
        v.requestId,
      );
      return c.json({
        ok: true,
        ...(kind === 'theme' ? { checks: validateTheme(parsed.data as Theme) } : {}),
      });
    },
  )

  .post(
    '/:kind/publish',
    kindParam,
    validate('json', z.strictObject({ confirmLogoChange: z.boolean().optional() })),
    async (c) => {
      const { kind } = c.req.valid('param');
      const v = c.var;
      requireAll(v, DOCUMENTS[kind].publish);
      const draft = await currentDraft(v.db, v.site.id, kind);
      const parsed = DOCUMENTS[kind].schema.safeParse(draft.data);
      if (!parsed.success) throw conflict('draft-invalid');
      if (kind === 'theme') {
        const theme = parsed.data as Theme;
        const checks = validateTheme(theme);
        if (checks.errors.length > 0) throw badRequest('theme-contrast', { errors: checks.errors });
        if (!publishable(checks)) {
          throw badRequest('theme-typography', { issues: checks.typography });
        }
        guardLogo(v, theme, c.req.valid('json').confirmLogoChange === true);
        await requireThemeFonts(v.db, theme);
      }
      return c.json(await publish(c, kind, parsed.data, null));
    },
  )

  .get('/:kind/versions', kindParam, async (c) => {
    const { kind } = c.req.valid('param');
    requireAll(c.var, DOCUMENTS[kind].view);
    const rows = await c.var.db
      .select({
        version: documentVersions.version,
        publishedAt: documentVersions.publishedAt,
        restoredFrom: documentVersions.restoredFrom,
        publishedBy: users.name,
      })
      .from(documentVersions)
      .leftJoin(users, eq(users.id, documentVersions.publishedBy))
      .where(and(eq(documentVersions.siteId, c.var.site.id), eq(documentVersions.kind, kind)))
      .orderBy(desc(documentVersions.version))
      .limit(50);
    return c.json(rows);
  })

  .post(
    '/:kind/rollback',
    kindParam,
    validate(
      'json',
      z.strictObject({
        version: z.number().int().positive(),
        confirmLogoChange: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const { kind } = c.req.valid('param');
      const v = c.var;
      requireAll(v, DOCUMENTS[kind].publish);
      const body = c.req.valid('json');
      const [old] = await v.db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.siteId, v.site.id),
            eq(documentVersions.kind, kind),
            eq(documentVersions.version, body.version),
          ),
        );
      if (!old) throw notFound();
      const parsed = DOCUMENTS[kind].schema.safeParse(old.data);
      if (!parsed.success) throw conflict('version-incompatible');
      if (kind === 'theme') {
        const theme = parsed.data as Theme;
        if (!publishable(validateTheme(theme))) throw conflict('version-incompatible');
        guardLogo(v, theme, body.confirmLogoChange === true);
        await requireThemeFonts(v.db, theme);
      }
      return c.json(await publish(c, kind, parsed.data, body.version));
    },
  );
