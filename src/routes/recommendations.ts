import { Router } from 'express';
import { recommendationQuerySchema, type RecommendationQuery } from '../domain/schemas.js';
import { HttpError, notFound } from '../errors.js';
import type { Repositories } from '../repositories/repository.js';
import { recommendCandidates, recommendJobs } from '../scoring/recommend.js';
import { normaliseWeights, type Weights } from '../scoring/weights.js';

function weightsFromQuery(q: RecommendationQuery): Partial<Weights> {
  const weights = { skills: q.wSkills, experience: q.wExperience, location: q.wLocation, salary: q.wSalary };
  try {
    normaliseWeights(weights); // validate early so a bad combination (e.g. all zero) is a 400, not a 500
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
  return weights;
}

/** GET /candidates/:id/recommendations — ranked jobs for a candidate. */
export function candidateRecommendationsRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });

  router.get('/:id/recommendations', async (req, res, next) => {
    try {
      const query = recommendationQuerySchema.parse(req.query);
      const candidate = await repos.candidates.findById(req.params.id);
      if (!candidate) throw notFound('Candidate', req.params.id);

      const weights = weightsFromQuery(query);
      const jobs = await repos.jobs.findAll();
      const recommendations = recommendJobs(candidate, jobs, { limit: query.limit, weights });

      res.json({
        candidateId: candidate.id,
        weights: normaliseWeights(weights),
        totalEligible: recommendJobs(candidate, jobs, { weights }).length,
        count: recommendations.length,
        recommendations: recommendations.map((r) => ({
          jobId: r.job.id,
          title: r.job.title,
          score: r.score,
          breakdown: r.breakdown,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** GET /jobs/:id/recommendations — reverse view: best-fit candidates for a job. */
export function jobRecommendationsRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });

  router.get('/:id/recommendations', async (req, res, next) => {
    try {
      const query = recommendationQuerySchema.parse(req.query);
      const job = await repos.jobs.findById(req.params.id);
      if (!job) throw notFound('Job', req.params.id);

      const weights = weightsFromQuery(query);
      const candidates = await repos.candidates.findAll();
      const recommendations = recommendCandidates(job, candidates, { limit: query.limit, weights });

      res.json({
        jobId: job.id,
        weights: normaliseWeights(weights),
        totalEligible: recommendCandidates(job, candidates, { weights }).length,
        count: recommendations.length,
        recommendations: recommendations.map((r) => ({
          candidateId: r.candidate.id,
          name: r.candidate.name,
          score: r.score,
          breakdown: r.breakdown,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
