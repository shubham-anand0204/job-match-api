import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  candidateRecommendationsResponseSchema,
  candidateResponseSchema,
  candidateSchema,
  errorResponseSchema,
  jobRecommendationsResponseSchema,
  jobResponseSchema,
  jobSchema,
  matchBreakdownSchema,
  requiredSkillSchema,
} from '../domain/schemas.js';
import { DEFAULT_WEIGHTS } from '../scoring/weights.js';

// Adds .openapi() to the Zod prototype. Must run before the registry is used.
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// --- Reusable components, registered once and referenced by every path -------

const Candidate = registry.register('Candidate', candidateResponseSchema);
const CandidateInput = registry.register('CandidateInput', candidateSchema);
const Job = registry.register('Job', jobResponseSchema);
const JobInput = registry.register('JobInput', jobSchema);
registry.register('RequiredSkill', requiredSkillSchema);
registry.register('MatchBreakdown', matchBreakdownSchema);
const ErrorResponse = registry.register('ErrorResponse', errorResponseSchema);
const JobRecommendations = registry.register('JobRecommendations', jobRecommendationsResponseSchema);
const CandidateRecommendations = registry.register(
  'CandidateRecommendations',
  candidateRecommendationsResponseSchema,
);

const idParam = z.string().openapi({
  param: { name: 'id', in: 'path' },
  example: '3f2b7c1e-5d4a-4c8b-9e6f-0a1b2c3d4e5f',
});

/**
 * Query parameters shared by both recommendation endpoints. Declared separately
 * from `recommendationQuerySchema` because that one coerces strings for runtime
 * parsing, which OpenAPI represents differently from the documented type.
 */
const recommendationParams = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' }, example: 5, description: 'Return only the top N results' }),
  wSkills: weightParam('skills', DEFAULT_WEIGHTS.skills),
  wExperience: weightParam('experience', DEFAULT_WEIGHTS.experience),
  wLocation: weightParam('location', DEFAULT_WEIGHTS.location),
  wSalary: weightParam('salary', DEFAULT_WEIGHTS.salary),
});

function weightParam(dimension: string, fallback: number) {
  const name = `w${dimension[0].toUpperCase()}${dimension.slice(1)}`;
  return z.coerce
    .number()
    .min(0)
    .optional()
    .openapi({
      param: { name, in: 'query' },
      description: `Weight for the ${dimension} dimension (default ${fallback}). All weights are normalised to sum to 100.`,
    });
}

const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } });

const errorResponses = {
  400: { description: 'Validation failed or unusable weights', content: json(ErrorResponse) },
  404: { description: 'Not found', content: json(ErrorResponse) },
};

// --- Paths ------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Meta'],
  summary: 'Liveness check',
  responses: {
    200: { description: 'Service is up', content: json(z.object({ status: z.literal('ok') })) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/candidates',
  tags: ['Candidates'],
  summary: 'Create a candidate profile',
  request: { body: { content: json(CandidateInput) } },
  responses: {
    201: { description: 'Candidate created', content: json(Candidate) },
    400: errorResponses[400],
  },
});

registry.registerPath({
  method: 'get',
  path: '/candidates',
  tags: ['Candidates'],
  summary: 'List all candidates',
  responses: { 200: { description: 'Every candidate', content: json(z.array(Candidate)) } },
});

registry.registerPath({
  method: 'get',
  path: '/candidates/{id}',
  tags: ['Candidates'],
  summary: 'Fetch one candidate',
  request: { params: z.object({ id: idParam }) },
  responses: { 200: { description: 'The candidate', content: json(Candidate) }, 404: errorResponses[404] },
});

registry.registerPath({
  method: 'get',
  path: '/candidates/{id}/recommendations',
  tags: ['Recommendations'],
  summary: 'Ranked jobs for a candidate',
  description: [
    'Returns jobs ranked by match score, highest first.',
    '',
    'Jobs requiring a must-have skill the candidate does not have are excluded entirely,',
    'regardless of how well they match on every other dimension. Nice-to-have skills raise',
    'the score but never exclude anyone.',
    '',
    'Each result carries a breakdown showing what each dimension contributed and why.',
  ].join('\n'),
  request: { params: z.object({ id: idParam }), query: recommendationParams },
  responses: {
    200: { description: 'Ranked jobs with score breakdowns', content: json(JobRecommendations) },
    ...errorResponses,
  },
});

registry.registerPath({
  method: 'post',
  path: '/jobs',
  tags: ['Jobs'],
  summary: 'Create a job posting',
  request: { body: { content: json(JobInput) } },
  responses: { 201: { description: 'Job created', content: json(Job) }, 400: errorResponses[400] },
});

registry.registerPath({
  method: 'get',
  path: '/jobs',
  tags: ['Jobs'],
  summary: 'List all jobs',
  responses: { 200: { description: 'Every job', content: json(z.array(Job)) } },
});

registry.registerPath({
  method: 'get',
  path: '/jobs/{id}',
  tags: ['Jobs'],
  summary: 'Fetch one job',
  request: { params: z.object({ id: idParam }) },
  responses: { 200: { description: 'The job', content: json(Job) }, 404: errorResponses[404] },
});

registry.registerPath({
  method: 'get',
  path: '/jobs/{id}/recommendations',
  tags: ['Recommendations'],
  summary: 'Best-fit candidates for a job (reverse view)',
  description:
    'The mirror of the candidate view: the same scoring rules applied in the opposite direction. ' +
    'Candidates missing a must-have skill are excluded.',
  request: { params: z.object({ id: idParam }), query: recommendationParams },
  responses: {
    200: { description: 'Ranked candidates with score breakdowns', content: json(CandidateRecommendations) },
    ...errorResponses,
  },
});

/** Builds the OpenAPI 3.1 document. Derived from the Zod schemas, so it cannot drift. */
export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'Job Match API',
      description: [
        'A transparent, rule-based job recommendation API.',
        '',
        'Every score is 0-100 and arrives with a breakdown explaining what each of the four',
        'dimensions contributed: skills, experience, location and salary. There is no model',
        'and nothing learned - every number traces back to a rule you can read.',
        '',
        `Default weights: skills ${DEFAULT_WEIGHTS.skills}, experience ${DEFAULT_WEIGHTS.experience}, ` +
          `location ${DEFAULT_WEIGHTS.location}, salary ${DEFAULT_WEIGHTS.salary}. ` +
          'Override any of them per request; they are normalised to sum to 100.',
      ].join('\n'),
      license: { name: 'MIT' },
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [
      { name: 'Candidates', description: 'Candidate profiles' },
      { name: 'Jobs', description: 'Job postings' },
      { name: 'Recommendations', description: 'Ranked matches in both directions' },
      { name: 'Meta', description: 'Health and documentation' },
    ],
  });
}
