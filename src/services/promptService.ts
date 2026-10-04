import { PrismaClient } from '../generated/prisma/client';
import { CreatePromptDTO, Paginated, PaginationParams, Prompt, PromptVersion, UpdatePromptDTO } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Business logic for prompts, now backed by PostgreSQL via Prisma.
 *
 * Compare with the Stage 3 version (git show stage-3:src/services/promptService.ts):
 * same methods, same return values — but every method is now `async`, because
 * talking to the database means waiting on the network.
 */
export class PromptService {
  // The client is INJECTED, so tests could pass a different one.
  constructor(private readonly db: PrismaClient) {}

  /**
   * Insert the prompt AND its version-1 history row in one TRANSACTION:
   * either both rows are written, or neither is. Without it, a crash between
   * the two inserts would leave a prompt with no history.
   */
  async create(data: CreatePromptDTO, userId: string): Promise<Prompt> {
    return this.db.$transaction(async (tx) => {
      const prompt = await tx.prompt.create({
        data: {
          title: data.title,
          content: data.content,
          tags: data.tags,
          isPublic: data.isPublic,
          createdBy: userId,
        },
      });
      await tx.promptVersion.create({
        data: { promptId: prompt.id, version: 1, content: prompt.content, changedBy: userId, changeReason: 'Created' },
      });
      return prompt;
    });
  }

  async getById(id: string): Promise<Prompt | null> {
    // prompts.id is a UUID column: Postgres REJECTS a query with id = 'abc'
    // (it would surface as a 500). An id that isn't a UUID can't exist → null → 404.
    if (!UUID_RE.test(id)) return null;
    return this.db.prompt.findUnique({ where: { id } });
  }

  async list({ page, limit }: PaginationParams): Promise<Paginated<Prompt>> {
    // Two queries in one transaction so `total` and `data` see the same snapshot.
    const [total, data] = await this.db.$transaction([
      this.db.prompt.count(),
      this.db.prompt.findMany({
        // Without ORDER BY, SQL returns rows in NO guaranteed order — pagination
        // could show the same row twice. `id` breaks ties between equal timestamps.
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit, // OFFSET
        take: limit, //               LIMIT
      }),
    ]);
    return { data, total, page, limit };
  }

  /**
   * Partial update. When `content` changes, bump `version` and record the new
   * content in prompt_versions — atomically.
   */
  async update(id: string, data: UpdatePromptDTO, userId: string, changeReason?: string): Promise<Prompt | null> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.prompt.findUnique({ where: { id } });
      if (!existing) return null;

      const contentChanged = data.content !== undefined && data.content !== existing.content;

      const updated = await tx.prompt.update({
        where: { id },
        data: {
          // `undefined` means "don't touch this column" in Prisma.
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
            changedBy: userId,
            changeReason: changeReason ?? null,
          },
        });
      }
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    // deleteMany doesn't throw when nothing matches (delete() would).
    // prompt_versions rows go too: ON DELETE CASCADE.
    const { count } = await this.db.prompt.deleteMany({ where: { id } });
    return count > 0;
  }

  /** History of a prompt's content, newest first. */
  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return this.db.promptVersion.findMany({
      where: { promptId },
      orderBy: { version: 'desc' },
    });
  }
}
