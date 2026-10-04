/**
 * Runs in every test file after Jest is ready. Closing the connection pool
 * lets Jest exit cleanly instead of warning about open handles.
 */
import { prisma } from '../src/config/database';

afterAll(async () => {
  await prisma.$disconnect();
});
