import { Router } from 'express';
import { AuditController } from '../controllers/auditController';
import { UserController } from '../controllers/userController';
import { PrismaClient } from '../generated/prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { updateUserSchema } from '../schemas/authSchemas';
import { AuthService } from '../services/authService';

/** Admin-only endpoints. */
export function userRoutes(authService: AuthService): Router {
  const router = Router();
  const controller = new UserController(authService);

  router.use(requireAuth(authService), requireRole('admin'));
  router.patch('/:id', validateBody(updateUserSchema), controller.update);

  return router;
}

export function auditRoutes(authService: AuthService, db: PrismaClient): Router {
  const router = Router();
  const controller = new AuditController(db);

  router.use(requireAuth(authService), requireRole('admin'));
  router.get('/', controller.list);

  return router;
}
