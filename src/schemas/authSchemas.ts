import { z } from 'zod';
import { ROLES } from '../types';

// Normalise emails so "Alice@Example.com" and "alice@example.com" are one account.
const email = z.email().trim().toLowerCase().max(255);

export const signupSchema = z.object({
  email,
  // Length beats complexity rules. 72 is bcrypt's input limit (bytes beyond it are ignored).
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

/** PATCH /api/users/:id (admin only) */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.enum(ROLES),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
