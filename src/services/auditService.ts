import { Prisma } from '../generated/prisma/client';

/**
 * Every security-relevant action gets an audit_logs row: who, what, on which
 * resource, when, plus details. Audit logs are APPEND-ONLY — never updated.
 */
export type AuditAction =
  | 'USER_SIGNED_UP'
  | 'USER_LOGGED_IN'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGGED_OUT'
  | 'USER_UPDATED'
  | 'PROMPT_CREATED'
  | 'PROMPT_UPDATED'
  | 'PROMPT_DELETED'
  | 'PROMPT_ANALYSIS_REQUESTED'
  | 'EXPERIMENT_CREATED'
  | 'EXPERIMENT_ANALYSIS_REQUESTED';

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  resourceType?: 'user' | 'prompt' | 'experiment';
  resourceId?: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Accepts a transaction client so the audit row is written in the SAME
 * transaction as the change it describes: if the change rolls back, so does
 * its audit entry, and a committed change can never be missing its audit entry.
 */
export async function writeAudit(db: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({ data: entry });
}
