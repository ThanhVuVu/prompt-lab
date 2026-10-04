/**
 * Fills the dev database with demo data:   npm run db:seed
 * (also runs automatically after `npm run db:reset`).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPrismaClient } from '../src/config/database';

const prisma = createPrismaClient(process.env.DATABASE_URL);

const prompts = [
  {
    title: 'Summarise a paper',
    content: 'Summarise the following research paper in 5 bullet points for an ML engineer:\n\n{{paper}}',
    tags: ['summarisation', 'research'],
    isPublic: true,
  },
  {
    title: 'Classify sentiment',
    content: 'Classify the sentiment of this review as "positive", "negative" or "mixed". Reply with one word.\n\n{{review}}',
    tags: ['classification'],
    isPublic: false,
  },
];

// Demo accounts — log in with POST /api/auth/login. Dev only!
const DEMO_PASSWORD = 'password123';
const users = [
  { id: 'alice', role: 'admin' },
  { id: 'bob', role: 'user' },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const { id, role } of users) {
    const data = { email: `${id}@example.local`, name: id[0].toUpperCase() + id.slice(1), role, passwordHash };
    await prisma.user.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  for (const p of prompts) {
    const exists = await prisma.prompt.findFirst({ where: { title: p.title, createdBy: 'alice' } });
    if (exists) continue;
    await prisma.prompt.create({
      data: {
        ...p,
        createdBy: 'alice',
        versions: { create: { version: 1, content: p.content, changedBy: 'alice', changeReason: 'Seed' } },
      },
    });
  }
  console.log(`Seeded alice (admin) and bob (user), password "${DEMO_PASSWORD}", and ${prompts.length} prompts.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
