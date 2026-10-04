import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { LoginInput, SignupInput, UpdateUserInput } from '../schemas/authSchemas';
import { AuthResult, AuthUser, PublicUser, Role } from '../types';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors';
import { writeAudit } from './auditService';

/** What we put inside the JWT. Keep it small, and never put secrets in it: anyone can base64-decode a JWT. */
interface TokenPayload {
  sub: string; // subject = user id
  ver: number; // tokenVersion at login time
}

type UserRow = Prisma.UserGetPayload<object>;

export class AuthService {
  constructor(private readonly db: PrismaClient) {}

  async signup(input: SignupInput): Promise<AuthResult> {
    // bcrypt adds a random salt and is deliberately SLOW, so stolen hashes
    // can't be brute-forced at billions of guesses per second.
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    try {
      const user = await this.db.$transaction(async (tx) => {
        const created = await tx.user.create({
          // Role is NOT taken from the request: anyone could sign up as admin.
          data: { email: input.email, name: input.name, passwordHash, role: 'user' },
        });
        await writeAudit(tx, { userId: created.id, action: 'USER_SIGNED_UP', resourceType: 'user', resourceId: created.id });
        return created;
      });
      return { token: this.issueToken(user), user: toPublicUser(user) };
    } catch (err) {
      // Let the UNIQUE constraint on email catch duplicates. Checking first with
      // findUnique and then inserting would be a race: two signups can both pass the check.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('An account with this email already exists');
      }
      throw err;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.db.user.findUnique({ where: { email: input.email } });

    // Always run bcrypt, even when the user doesn't exist, so the response time
    // doesn't reveal which emails have accounts.
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !valid) {
      await writeAudit(this.db, {
        userId: user?.id ?? null,
        action: 'USER_LOGIN_FAILED',
        details: { email: input.email },
      });
      // Same message for "no such user" and "wrong password": don't help attackers enumerate accounts.
      throw new UnauthorizedError('Invalid email or password');
    }

    await writeAudit(this.db, { userId: user.id, action: 'USER_LOGGED_IN', resourceType: 'user', resourceId: user.id });
    return { token: this.issueToken(user), user: toPublicUser(user) };
  }

  /**
   * JWTs are stateless: the server can't "delete" one. Instead, bump the user's
   * tokenVersion; verifyToken() rejects tokens carrying an older version.
   * (This logs the user out on ALL devices.)
   */
  async logout(userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await writeAudit(tx, { userId, action: 'USER_LOGGED_OUT', resourceType: 'user', resourceId: userId });
    });
  }

  /**
   * Turns a bearer token into the AuthUser it belongs to, or throws 401.
   * We look the user up on every request so that logout, deleted users and
   * role changes take effect immediately. The cost is one indexed query per request.
   */
  async verifyToken(token: string): Promise<AuthUser> {
    let payload: TokenPayload;
    try {
      // Pin the algorithm: never let the token itself choose how it's verified.
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedError('Invalid or expired token');
    }
    return { id: user.id, role: user.role as Role };
  }

  async getUser(id: string): Promise<PublicUser> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError(`User ${id} not found`);
    return toPublicUser(user);
  }

  async updateUser(id: string, input: UpdateUserInput, actorId: string): Promise<PublicUser> {
    const user = await this.db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError(`User ${id} not found`);

      const updated = await tx.user.update({ where: { id }, data: input });
      await writeAudit(tx, {
        userId: actorId,
        action: 'USER_UPDATED',
        resourceType: 'user',
        resourceId: id,
        details: { before: { name: existing.name, role: existing.role }, after: input },
      });
      return updated;
    });
    return toPublicUser(user);
  }

  private issueToken(user: UserRow): string {
    const payload: Omit<TokenPayload, 'sub'> = { ver: user.tokenVersion };
    return jwt.sign(payload, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }
}

/** Whitelist the fields we expose. Spreading the row would leak passwordHash. */
export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role, createdAt: user.createdAt };
}

// A valid bcrypt hash of a random string, used to keep login timing constant.
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.6XGdyFq0nSEBZr6y5ZpjW5zM0J2e';
