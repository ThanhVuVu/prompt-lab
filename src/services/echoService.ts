import { EchoResponse } from '../types';
import { NotImplementedError } from '../utils/errors';

/**
 * SERVICE layer = business logic. It knows nothing about HTTP:
 * no req, no res, no status codes. Just data in → data out.
 *
 * That makes it easy to test (plain function call) and to reuse
 * (from an HTTP route today, a background job or CLI tomorrow).
 */
export class EchoService {
  /**
   * @param message  the text to echo back
   * @param now      the current time — a parameter so tests can pass a fixed
   *                 date and get a predictable result ("dependency injection")
   */
  buildEcho(message: string, now: Date = new Date()): EchoResponse {
    // TODO(stage2): Move the response-building logic from stage1/hello-server.ts here.
    //               Return { received, timestamp } using `now`.
    throw new NotImplementedError('stage2: EchoService.buildEcho() in src/services/echoService.ts');
  }
}
