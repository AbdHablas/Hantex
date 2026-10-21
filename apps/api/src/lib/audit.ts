import { auditLog, type Database } from '@hantex/db/worker';

export interface AuditActor {
  userId: string | null;
  label: string;
}

export interface AuditEntry {
  action: string;
  /** The site the action concerned; omit for platform-wide actions. */
  siteId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Never include secrets or full personal data; mask contact details. */
  details?: Record<string, unknown>;
}

export async function writeAudit(
  db: Database,
  actor: AuditActor,
  entry: AuditEntry,
  requestId?: string,
): Promise<void> {
  await db.insert(auditLog).values({
    siteId: entry.siteId ?? null,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? {},
    requestId: requestId ?? null,
  });
}

/** "a***@example.com" or "+963*******56" — enough to identify an entry, not to use it. */
export function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(0, value.length - 6))}${value.slice(-2)}`;
}
