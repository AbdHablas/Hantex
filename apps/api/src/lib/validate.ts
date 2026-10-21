import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { badRequest } from './errors';

/** zValidator that answers with our error format: { error: 'invalid-input', details: { issues } }. */
export const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw badRequest('invalid-input', {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        })),
      });
    }
  });
