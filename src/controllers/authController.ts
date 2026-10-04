import { Request, Response } from 'express';
import { LoginInput, SignupInput } from '../schemas/authSchemas';
import { AuthService } from '../services/authService';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/auth/signup → 201 { token, user } | 400 | 409 */
  signup = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.authService.signup(req.body as SignupInput));
  };

  /** POST /api/auth/login → 200 { token, user } | 401 */
  login = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.authService.login(req.body as LoginInput));
  };

  /** POST /api/auth/logout → 204. Every token issued so far stops working. */
  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(req.user!.id);
    res.status(204).send();
  };

  /** GET /api/auth/me → 200 current user */
  me = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.authService.getUser(req.user!.id));
  };
}
