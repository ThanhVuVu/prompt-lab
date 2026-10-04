import { Prisma, PrismaClient } from '../generated/prisma/client';
import { AuthUser, CreatePromptDTO, Paginated, PaginationParams, Prompt, PromptVersion, UpdatePromptDTO } from '../types';
import { writeAudit } from './auditService';
import { Cache, NoCache } from './cache';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Business logic for prompts, backed by PostgreSQL via Prisma.
 *
 * Stage 5: every write takes the acting user and records an audit_logs row
 * in the same transaction.
 */
const cacheKey = (id: string) => `prompt:${id}`;

export class PromptService {
  constructor(
    private readonly db: PrismaClient,
    // Stage 10: optional cache for getById (the most frequent read).
    private readonly cache: Cache = new NoCache(),
  ) {}

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

    // CACHE-ASIDE: 1) look in the cache, 2) on a miss read the database,
    // 3) store the result for next time. Writes (update/delete) DELETE the
    // key, so the next read fetches fresh data.
    const cached = await this.cache.get<Prompt>(cacheKey(id));
    if (cached) return reviveDates(cached);

    const prompt = await this.db.prompt.findUnique({ where: { id } });
    if (prompt) await this.cache.set(cacheKey(id), prompt);
    return prompt;
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
    const updated = await this.db.$transaction(async (tx) => {
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
    // Invalidate AFTER the commit: invalidating inside the transaction would let
    // a concurrent read re-cache the old row before the commit lands.
    await this.cache.del(cacheKey(id));
    return updated;
  }

  async delete(id: string, actor: AuthUser): Promise<boolean> {
    const deleted = await this.db.$transaction(async (tx) => {
      const { count } = await tx.prompt.deleteMany({ where: { id } });
      if (count > 0) {
        await writeAudit(tx, { userId: actor.id, action: 'PROMPT_DELETED', resourceType: 'prompt', resourceId: id });
      }
      return count > 0;
    });
    await this.cache.del(cacheKey(id));
    return deleted;
  }

  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return this.db.promptVersion.findMany({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
  }
}

/** JSON has no Date type: cached dates come back as ISO strings. */
function reviveDates(prompt: Prompt): Prompt {
  return { ...prompt, createdAt: new Date(prompt.createdAt), updatedAt: new Date(prompt.updatedAt) };
}
