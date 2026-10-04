import { Request, Response } from 'express';
import { JobService } from '../services/jobService';

export class JobController {
  constructor(private readonly jobService: JobService) {}

  /** GET /api/jobs/:id → 200 { id, status, result, error, … } | 404 */
  getById = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.jobService.getJob(req.params.id as string, req.user!));
  };
}
