import { Router, type RequestHandler } from 'express';
import { recommendationQuerySchema } from '../domain/schemas.js';
import { HttpError, notFound } from '../errors.js';
import type { Repositories } from '../repositories/repository.js';
import { recommendCandidates, recommendJobs } from '../scoring/recommend.js';
import { normaliseWeights, type Weights } from '../scoring/weights.js';
import type { MatchBreakdown } from '../scoring/scorer.js';

interface ParsedOptions {
  limit?: number;
  weights: Partial<Weights>;
  normalisedWeights: Weights;
}

/**
 * Parses limit and weight overrides from the query string. Weights are validated
 * here so an unusable combination (e.g. all zero) is a 400 from the edge rather
 * than a division by zero deep inside the scorer.
 */
function parseOptions(query: unknown): ParsedOptions {
  const q = recommendationQuerySchema.parse(query);
  const weights: Partial<Weights> = {
    skills: q.wSkills,
    experience: q.wExperience,
    location: q.wLocation,
    salary: q.wSalary,
  };
  try {
    return { limit: q.limit, weights, normalisedWeights: normaliseWeights(weights) };
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

interface ScoredEntry {
  score: number;
  breakdown: MatchBreakdown;
}

/**
 * Shared response shape for both directions. The full ranked list is scored once
 * and sliced here, so `totalEligible` costs nothing extra.
 */
function buildResponse<T extends ScoredEntry>(
  subject: Record<string, string>,
  ranked: T[],
  options: ParsedOptions,
  toItem: (entry: T) => Record<string, unknown>,
): Record<string, unknown> {
  const limited = options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
  return {
    ...subject,
    weights: options.normalisedWeights,
    totalEligible: ranked.length,
    count: limited.length,
    recommendations: limited.map((entry) => ({
      ...toItem(entry),
      score: entry.score,
      breakdown: entry.breakdown,
    })),
  };
}

/** GET /candidates/:id/recommendations — ranked jobs for one candidate. */
export function candidateRecommendationsRouter(repos: Repositories): Router {
  const handler: RequestHandler = async (req, res, next) => {
    try {
      const options = parseOptions(req.query);
      const candidate = await repos.candidates.findById(req.params.id);
      if (!candidate) throw notFound('Candidate', req.params.id);

      const jobs = await repos.jobs.findAll();
      const ranked = recommendJobs(candidate, jobs, { weights: options.weights });

      res.json(
        buildResponse({ candidateId: candidate.id }, ranked, options, (r) => ({
          jobId: r.job.id,
          title: r.job.title,
        })),
      );
    } catch (err) {
      next(err);
    }
  };

  return Router().get('/:id/recommendations', handler);
}

/** GET /jobs/:id/recommendations — reverse view: best-fit candidates for one job. */
export function jobRecommendationsRouter(repos: Repositories): Router {
  const handler: RequestHandler = async (req, res, next) => {
    try {
      const options = parseOptions(req.query);
      const job = await repos.jobs.findById(req.params.id);
      if (!job) throw notFound('Job', req.params.id);

      const candidates = await repos.candidates.findAll();
      const ranked = recommendCandidates(job, candidates, { weights: options.weights });

      res.json(
        buildResponse({ jobId: job.id }, ranked, options, (r) => ({
          candidateId: r.candidate.id,
          name: r.candidate.name,
        })),
      );
    } catch (err) {
      next(err);
    }
  };

  return Router().get('/:id/recommendations', handler);
}
