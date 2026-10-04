import { z } from 'zod';
import { env } from '../config/env';

/** POST /api/experiments */
export const createExperimentSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    promptAId: z.uuid(),
    promptBId: z.uuid(),
    // Each test case maps template variables to values: [{ "ticket": "My order…" }, …]
    inputs: z
      .array(z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(10_000)))
      .min(1)
      .max(env.EXPERIMENT_MAX_INPUTS),
  })
  .refine((data) => data.promptAId !== data.promptBId, {
    message: 'Prompt A and prompt B must be different prompts',
    path: ['promptBId'],
  });

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;
