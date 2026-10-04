import { Request, Response } from 'express';
import { formatZodError } from '../middleware/validation';
import { listPromptsQuerySchema } from '../schemas/promptSchemas';
import { CreateExperimentInput } from '../schemas/experimentSchemas';
import { ExperimentService } from '../services/experimentService';
import { ValidationError } from '../utils/errors';

export class ExperimentController {
  constructor(private readonly experiments: ExperimentService) {}

  /** POST /api/experiments → 202 { experimentId, jobId, status, statusUrl } | 400 | 402 | 404 */
  create = async (req: Request, res: Response): Promise<void> => {
    const { experiment, job } = await this.experiments.create(req.body as CreateExperimentInput, req.user!);
    const statusUrl = `/api/experiments/${experiment.id}`;
    res.status(202).location(statusUrl).json({ experimentId: experiment.id, jobId: job.id, status: experiment.status, statusUrl });
  };

  /** GET /api/experiments/:id → 200 experiment + results + judgments + summary | 404 */
  getById = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await this.experiments.get(req.params.id as string, req.user!));
  };

  /** GET /api/experiments?page=&limit= → 200 { data, total, page, limit } */
  list = async (req: Request, res: Response): Promise<void> => {
    const query = listPromptsQuerySchema.safeParse(req.query);
    if (!query.success) throw new ValidationError('Invalid query parameters', formatZodError(query.error));
    res.status(200).json(await this.experiments.list(req.user!, query.data.page, query.data.limit));
  };
}
