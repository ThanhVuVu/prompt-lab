import { Router } from 'express';
import { JobController } from '../controllers/jobController';
import { requireAuth } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { JobService } from '../services/jobService';

export function jobRoutes(jobService: JobService, authService: AuthService): Router {
  const router = Router();
  const controller = new JobController(jobService);

  router.use(requireAuth(authService));
  router.get('/:id', controller.getById);

  return router;
}
