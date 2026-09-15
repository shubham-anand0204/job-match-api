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

// ---------------------------------------------------------------------------
// Response schemas.
//
// These describe what the API returns. They are not used to validate incoming
// requests; they exist so the OpenAPI document is generated from the same
// source of truth as the request schemas, and so tests can assert that a real
// response still matches the published contract.
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();

export const candidateResponseSchema = candidateSchema.extend({ id: uuid });
export const jobResponseSchema = jobSchema.extend({ id: uuid });

export const dimensionScoreSchema = z.object({
  score: z.number().describe('Points awarded for this dimension'),
  max: z.number().describe('Maximum points available for this dimension'),
  detail: z.string().describe('Human-readable explanation of how the points were derived'),
});

export const matchBreakdownSchema = z.object({
  skills: dimensionScoreSchema,
  experience: dimensionScoreSchema,
  location: dimensionScoreSchema,
  salary: dimensionScoreSchema,
});

export const weightsSchema = z.object({
  skills: z.number(),
  experience: z.number(),
  location: z.number(),
  salary: z.number(),
});

const recommendationEnvelope = {
  weights: weightsSchema.describe('The weights actually applied, normalised to sum to 100'),
  totalEligible: z.number().int().describe('Results that passed the must-have filter, before limit'),
  count: z.number().int().describe('Results actually returned after limit'),
};

export const jobRecommendationsResponseSchema = z.object({
  candidateId: uuid,
  ...recommendationEnvelope,
  recommendations: z.array(
    z.object({
      jobId: uuid,
      title: z.string(),
      score: z.number().min(0).max(100),
      breakdown: matchBreakdownSchema,
    }),
  ),
});

export const candidateRecommendationsResponseSchema = z.object({
  jobId: uuid,
  ...recommendationEnvelope,
  recommendations: z.array(
    z.object({
      candidateId: uuid,
      name: z.string(),
      score: z.number().min(0).max(100),
      breakdown: matchBreakdownSchema,
    }),
  ),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  details: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe('Present on validation failures, one entry per offending field'),
});
