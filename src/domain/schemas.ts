import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1, 'must not be empty');

export const candidateSchema = z.object({
  name: nonEmptyString,
  skills: z.array(nonEmptyString).min(1, 'at least one skill is required'),
  yearsOfExperience: z.number().min(0).max(80),
  location: nonEmptyString,
  expectedSalary: z.number().positive(),
});

export const requiredSkillSchema = z.object({
  name: nonEmptyString,
  importance: z.enum(['must-have', 'nice-to-have']),
});

export const jobSchema = z.object({
  title: nonEmptyString,
  requiredSkills: z.array(requiredSkillSchema),
  minYearsExperience: z.number().min(0).max(80),
  location: nonEmptyString,
  salaryRange: z
    .object({ min: z.number().min(0), max: z.number().min(0) })
    .refine((r) => r.max >= r.min, { message: 'salaryRange.max must be >= salaryRange.min' }),
  remoteAllowed: z.boolean(),
});

/** Query params for both recommendation endpoints. Coerces from strings. */
export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).optional(),
  wSkills: z.coerce.number().min(0).optional(),
  wExperience: z.coerce.number().min(0).optional(),
  wLocation: z.coerce.number().min(0).optional(),
  wSalary: z.coerce.number().min(0).optional(),
});

export type CandidateInput = z.infer<typeof candidateSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
