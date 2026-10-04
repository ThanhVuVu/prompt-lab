import { Prisma, PrismaClient } from '../generated/prisma/client';
import { AuthUser, CreatePromptDTO, Paginated, PaginationParams, Prompt, PromptVersion, UpdatePromptDTO } from '../types';
import { writeAudit } from './auditService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Business logic for prompts, backed by PostgreSQL via Prisma.
 *
 * Stage 5: every write takes the acting user and records an audit_logs row
 * in the same transaction.
 */
export class PromptService {
  constructor(private readonly db: PrismaClient) {}

  async create(data: CreatePromptDTO, actor: AuthUser): Promise<Prompt> {
    return this.db.$transaction(async (tx) => {
      const prompt = await tx.prompt.create({
        data: {
          title: data.title,
          content: data.content,
          tags: data.tags,
          isPublic: data.isPublic,
          createdBy: actor.id,
        },
      });
      await tx.promptVersion.create({
        data: { promptId: prompt.id, version: 1, content: prompt.content, changedBy: actor.id, changeReason: 'Created' },
      });
      await writeAudit(tx, { userId: actor.id, action: 'PROMPT_CREATED', resourceType: 'prompt', resourceId: prompt.id });
      return prompt;
    });
  }

  async getById(id: string): Promise<Prompt | null> {
    // prompts.id is a UUID column: Postgres REJECTS a query with id = 'abc'.
    // An id that isn't a UUID can't exist → null → 404.
    if (!UUID_RE.test(id)) return null;
    return this.db.prompt.findUnique({ where: { id } });
  }

  /**
   * One page of the prompts `viewer` may see: their own + public ones
   * (admins see everything). The filter runs in SQL — never fetch everything
   * and filter in JavaScript.
   */
  async list({ page, limit }: PaginationParams, viewer: AuthUser): Promise<Paginated<Prompt>> {
    const where: Prisma.PromptWhereInput =
      viewer.role === 'admin' ? {} : { OR: [{ isPublic: true }, { createdBy: viewer.id }] };

    const [total, data] = await this.db.$transaction([
      this.db.prompt.count({ where }),
      this.db.prompt.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data, total, page, limit };
  }

  async update(id: string, data: UpdatePromptDTO, actor: AuthUser, changeReason?: string): Promise<Prompt | null> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.prompt.findUnique({ where: { id } });
      if (!existing) return null;

      const contentChanged = data.content !== undefined && data.content !== existing.content;

      const updated = await tx.prompt.update({
        where: { id },
        data: {
          title: data.title,
          content: data.content,
          tags: data.tags,
          isPublic: data.isPublic,
          ...(contentChanged && { version: { increment: 1 } }),
        },
      });

      if (contentChanged) {
        await tx.promptVersion.create({
          data: {
            promptId: id,
            version: updated.version,
            content: updated.content,
            changedBy: actor.id,
            changeReason: changeReason ?? null,
          },
        });
      }

      await writeAudit(tx, {
        userId: actor.id,
        action: 'PROMPT_UPDATED',
        resourceType: 'prompt',
        resourceId: id,
        details: { fields: Object.keys(data), oldVersion: existing.version, newVersion: updated.version },
      });
      return updated;
    });
  }

  async delete(id: string, actor: AuthUser): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.prompt.deleteMany({ where: { id } });
      if (count > 0) {
        await writeAudit(tx, { userId: actor.id, action: 'PROMPT_DELETED', resourceType: 'prompt', resourceId: id });
      }
      return count > 0;
    });
  }

  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return this.db.promptVersion.findMany({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
  }
}
