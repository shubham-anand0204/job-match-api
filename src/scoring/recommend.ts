import type { Candidate, Job } from '../domain/types.js';
import { checkEligibility, scoreMatch, type MatchBreakdown } from './scorer.js';
import type { Weights } from './weights.js';

export interface JobRecommendation {
  job: Job;
  score: number;
  breakdown: MatchBreakdown;
}

export interface CandidateRecommendation {
  candidate: Candidate;
  score: number;
  breakdown: MatchBreakdown;
}

export interface RecommendOptions {
  limit?: number;
  weights?: Partial<Weights>;
}

/** Rank jobs for one candidate. Jobs missing a must-have skill are dropped. */
export function recommendJobs(candidate: Candidate, jobs: Job[], opts: RecommendOptions = {}): JobRecommendation[] {
  const ranked = jobs
    .filter((job) => checkEligibility(candidate, job).eligible)
    .map((job) => ({ job, ...scoreMatch(candidate, job, opts.weights) }))
    .sort((a, b) => b.score - a.score || a.job.title.localeCompare(b.job.title) || a.job.id.localeCompare(b.job.id));
  return applyLimit(ranked, opts.limit);
}

/** Reverse view: rank candidates for one job. */
export function recommendCandidates(
  job: Job,
  candidates: Candidate[],
  opts: RecommendOptions = {},
): CandidateRecommendation[] {
  const ranked = candidates
    .filter((candidate) => checkEligibility(candidate, job).eligible)
    .map((candidate) => ({ candidate, ...scoreMatch(candidate, job, opts.weights) }))
    .sort(
      (a, b) =>
        b.score - a.score || a.candidate.name.localeCompare(b.candidate.name) || a.candidate.id.localeCompare(b.candidate.id),
    );
  return applyLimit(ranked, opts.limit);
}

function applyLimit<T>(items: T[], limit?: number): T[] {
  return limit !== undefined && limit >= 0 ? items.slice(0, limit) : items;
}
