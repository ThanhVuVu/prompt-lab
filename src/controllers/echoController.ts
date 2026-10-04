import { Request, Response } from 'express';
import { EchoService } from '../services/echoService';
import { ValidationError } from '../utils/errors';

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
  echo = (req: Request, res: Response): void => {
    const message: unknown = req.body?.message;

    // 1. Validate. Throwing is enough: errorHandler turns it into a 400 response.
    if (typeof message !== 'string' || message.length === 0) {
      throw new ValidationError('`message` must be a non-empty string');
    }

    // 2. Business logic lives in the service. 3. The controller picks the status.
    res.status(200).json(this.echoService.buildEcho(message));
  };
}
