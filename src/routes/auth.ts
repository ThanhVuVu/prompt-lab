import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { loginSchema, signupSchema } from '../schemas/authSchemas';
import { AuthService } from '../services/authService';

export function authRoutes(authService: AuthService): Router {
  const router = Router();
  const controller = new AuthController(authService);

  router.post('/signup', validateBody(signupSchema), controller.signup);
  router.post('/login', validateBody(loginSchema), controller.login);
  router.post('/logout', requireAuth(authService), controller.logout);
  router.get('/me', requireAuth(authService), controller.me);

  return router;
}
