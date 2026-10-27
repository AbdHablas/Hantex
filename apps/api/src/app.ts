import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps, AppEnv } from './context';
import { HttpError } from './lib/errors';
import { requestId, sameOrigin, securityHeaders } from './middleware/security';
import { requireSession, withDb, withSite } from './middleware/session';
import { auditRoutes, siteAuditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { builderRoutes } from './routes/builder';
import { catalogueRoutes } from './routes/catalogue';
import { catalogueFileRoutes } from './routes/catalogue-files';
import { documentRoutes } from './routes/documents';
import { enrolmentRoutes } from './routes/enrolment';
import { meRoutes } from './routes/me';
import { overviewRoutes } from './routes/overview';
import { previewRoutes } from './routes/preview';
import { publishCallbackRoutes, publishJobRoutes } from './routes/publish';
import { presetRoutes } from './routes/presets';
import { roleRoutes } from './routes/roles';
import { siteConfigRoutes, sitesRoutes } from './routes/sites';
import { siteStaffRoutes, staffRoutes } from './routes/staff';
import { subscriberRoutes } from './routes/subscribers';
import { announcementRoutes } from './routes/announcements';
import { fontRoutes } from './routes/fonts';
import { mediaRoutes } from './routes/media';

/**
 * One site's API (`/api/sites/:siteKey/...`, D-024): every request is checked against the
 * person's permissions on that site, and every query is limited to that site.
 */
function siteApi() {
  return new Hono<AppEnv>()
    .use('*', withSite)
    .route('/', siteConfigRoutes)
    .route('/overview', overviewRoutes)
    .route('/documents', documentRoutes)
    .route('/', builderRoutes)
    .route('/catalogue/files', catalogueFileRoutes)
    .route('/catalogue', catalogueRoutes)
    .route('/preview', previewRoutes)
    .route('/subscribers', subscriberRoutes)
    .route('/announcements', announcementRoutes)
    .route('/media', mediaRoutes)
    .route('/publish', publishJobRoutes)
    .route('/staff', siteStaffRoutes)
    .route('/audit', siteAuditRoutes);
}

/**
 * Staff-only API, behind a session and checked against the roles matrix on every request.
 * Platform routes use the permissions of an all-sites role; site routes those on the site.
 */
function staffApi() {
  return new Hono<AppEnv>()
    .use('*', requireSession)
    .route('/me', meRoutes)
    .route('/staff', staffRoutes)
    .route('/roles', roleRoutes)
    .route('/audit', auditRoutes)
    .route('/theme-presets', presetRoutes)
    .route('/fonts', fontRoutes)
    .route('/sites', sitesRoutes)
    .route('/sites/:siteKey', siteApi());
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', requestId);
  app.use('/api/*', securityHeaders);
  app.use('/api/*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json(
        { error: error.code, ...(error.details ? { details: error.details } : {}) },
        error.status,
      );
    }
    if (error instanceof HTTPException) {
      return c.json(
        { error: error.status === 400 ? 'invalid-input' : 'request-error' },
        error.status,
      );
    }
    // Log the error type and message only: no request bodies, tokens or personal data.
    console.error('unhandled error', {
      requestId: c.var.requestId,
      name: error.name,
      message: error.message,
    });
    return c.json({ error: 'internal-error', requestId: c.var.requestId }, 500);
  });
  app.notFound((c) => c.json({ error: 'not-found' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/config', (c) =>
    c.json({ turnstileSiteKey: c.env.TURNSTILE_SITE_KEY, environment: c.env.ENVIRONMENT }),
  );

  // Machine-to-machine: authenticated by a bearer secret, so it sits before the same-origin check.
  app.use('/api/publish/jobs/:id/result', withDb);
  app.route('/api/publish', publishCallbackRoutes);

  app.use('/api/*', sameOrigin);
  app.use('/api/*', withDb);
  app.route('/api/auth', authRoutes);
  app.route('/api/enrolment', enrolmentRoutes);
  app.route('/api', staffApi());

  return app;
}
