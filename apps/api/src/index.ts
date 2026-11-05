import { connectWorkerDb } from '@hantex/db/worker';
import { createApp } from './app';
import type { AppDeps } from './context';
import { runDueSchedules } from './lib/scheduled-run';
import type { Env } from './env';
import { memorySender, resendSender } from './lib/email';
import { r2Store } from './lib/media-store';
import { disabledPublisher, githubPublisher } from './lib/publisher';
import { cloudflareTurnstile } from './lib/turnstile';

const deps: AppDeps = {
  connectDb: (env) => connectWorkerDb(env.HYPERDRIVE.connectionString),
  email: (env) => {
    if (env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY, env.EMAIL_FROM);
    if (env.ENVIRONMENT === 'production') throw new Error('RESEND_API_KEY is not configured');
    return memorySender();
  },
  media: (env) => {
    if (!env.MEDIA) throw new Error('The MEDIA bucket binding is not configured');
    return r2Store(env.MEDIA);
  },
  publicMedia: (env) => {
    if (!env.MEDIA_PUBLIC) throw new Error('The MEDIA_PUBLIC bucket binding is not configured');
    return r2Store(env.MEDIA_PUBLIC);
  },
  turnstile: (env) => cloudflareTurnstile(env.TURNSTILE_SECRET_KEY),
  publisher: (env) =>
    env.PUBLISH_TRIGGER_TOKEN && env.PUBLISH_REPOSITORY
      ? githubPublisher({
          token: env.PUBLISH_TRIGGER_TOKEN,
          repository: env.PUBLISH_REPOSITORY,
          workflow: env.PUBLISH_WORKFLOW ?? 'publish.yml',
          ref: env.PUBLISH_REF ?? 'main',
        })
      : disabledPublisher,
};
const app = createApp(deps);

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // Scheduled publishing (D-054): the cron trigger in wrangler.jsonc, every five minutes.
  scheduled: (_controller, env, ctx) => {
    ctx.waitUntil(runDueSchedules(deps, env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
