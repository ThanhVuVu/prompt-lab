import { Request, Response } from 'express';
import { UpdateUserInput } from '../schemas/authSchemas';
import { AuthService } from '../services/authService';

export class UserController {
  constructor(private readonly authService: AuthService) {}

  /** PATCH /api/users/:id (admin only) → 200 | 400 | 404 */
  update = async (req: Request, res: Response): Promise<void> => {
    const user = await this.authService.updateUser(req.params.id as string, req.body as UpdateUserInput, req.user!.id);
    res.status(200).json(user);
  };
}
