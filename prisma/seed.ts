/**
 * Fills the dev database with demo data:   npm run db:seed
 * (also runs automatically after `npm run db:reset`).
 */
import 'dotenv/config';
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

async function main(): Promise<void> {
  for (const id of ['alice', 'bob']) {
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, email: `${id}@example.local`, name: id[0].toUpperCase() + id.slice(1) },
    });
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
  console.log('Seeded users alice, bob and', prompts.length, 'prompts.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
