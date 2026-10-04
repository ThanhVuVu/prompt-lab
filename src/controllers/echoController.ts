import { Request, Response } from 'express';
import { EchoService } from '../services/echoService';
import { NotImplementedError } from '../utils/errors';

export class EchoController {
  constructor(private readonly echoService: EchoService) {}

  /**
   * POST /echo   body: { "message": "hello" }
   * 200 → { received, timestamp }
   * 400 → { error: { code: 'VALIDATION_ERROR', ... } } if message is not a non-empty string
   *
   * Why is this an ARROW FUNCTION property instead of a normal method?
   * Because the router calls it as a plain function: router.post('/', controller.echo).
   * A normal method would lose `this` and `this.echoService` would crash.
   */
  echo = (_req: Request, _res: Response): void => {
    // TODO(stage2): Port your Stage 1 /echo handler here, but split responsibilities:
    //   1. Validate req.body.message. If invalid: throw new ValidationError('...')
    //      (import it from '../utils/errors') — the error handler turns it into a 400.
    //   2. Call this.echoService.buildEcho(message).
    //   3. Respond 200 with the result.
    throw new NotImplementedError('stage2: EchoController.echo() in src/controllers/echoController.ts');
  };
}
