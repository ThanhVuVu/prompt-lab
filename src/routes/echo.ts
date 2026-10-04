import { Router } from 'express';
import { EchoController } from '../controllers/echoController';
import { EchoService } from '../services/echoService';

/**
 * ROUTES layer = the "table of contents" of the API.
 * Only maps (METHOD, path) → middleware → controller. No logic.
 */
export function echoRoutes(echoService: EchoService): Router {
  const router = Router();
  const controller = new EchoController(echoService);

  router.post('/', controller.echo);

  return router;
}
