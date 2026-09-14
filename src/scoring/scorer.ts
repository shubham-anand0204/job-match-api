import type { Candidate, Job } from '../domain/types.js';
import { normaliseWeights, type Weights } from './weights.js';

/**
 * Tunable constants of the formula. Kept in one place so the README can
 * reference them and tests can reason about exact numbers.
 */
export const SCORING_CONSTANTS = {
  /** Fraction of location points awarded when the job is remote but not in the candidate's city. */
  remoteLocationFactor: 0.7,
  /** Fraction of salary points awarded when the job's max exactly equals the expectation. */
  salaryAtMaxFactor: 0.5,
  /** How far (as a fraction of expectation) below expectation a job's max may be before salary points hit zero. */
  salaryShortfallTolerance: 0.1,
} as const;

export interface DimensionScore {
  /** Points awarded for this dimension. */
  score: number;
  /** Maximum points available for this dimension (the weight). */
  max: number;
  /** Human-readable explanation of how the points were derived. */
  detail: string;
}

export interface MatchBreakdown {
  skills: DimensionScore;
  experience: DimensionScore;
  location: DimensionScore;
  salary: DimensionScore;
}

export interface MatchResult {
  /** Overall match score, 0-100, rounded to one decimal. */
  score: number;
  breakdown: MatchBreakdown;
}

export interface EligibilityResult {
  eligible: boolean;
  missingMustHaveSkills: string[];
}

export const normaliseSkill = (s: string): string => s.trim().toLowerCase();
export const normaliseLocation = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Hard filter. A job is only eligible when the candidate has every must-have skill.
 */
export function checkEligibility(candidate: Candidate, job: Job): EligibilityResult {
  const candidateSkills = new Set(candidate.skills.map(normaliseSkill));
  const missing = job.requiredSkills
    .filter((s) => s.importance === 'must-have' && !candidateSkills.has(normaliseSkill(s.name)))
    .map((s) => s.name);
  return { eligible: missing.length === 0, missingMustHaveSkills: missing };
}

/**
 * Skills dimension: fraction of the job's listed skills the candidate has.
 * Must-haves are always matched here (otherwise the job was filtered out), so
 * the score really measures nice-to-have coverage, weighted by how much of the
 * job's skill list the nice-to-haves represent. A job with no skills scores full.
 */
export function scoreSkills(candidate: Candidate, job: Job, max: number): DimensionScore {
  const candidateSkills = new Set(candidate.skills.map(normaliseSkill));
  const total = job.requiredSkills.length;
  if (total === 0) {
    return { score: max, max, detail: 'job lists no skills' };
  }
  const mustHaves = job.requiredSkills.filter((s) => s.importance === 'must-have');
  const niceToHaves = job.requiredSkills.filter((s) => s.importance === 'nice-to-have');
  const matchedMust = mustHaves.filter((s) => candidateSkills.has(normaliseSkill(s.name))).length;
  const matchedNice = niceToHaves.filter((s) => candidateSkills.has(normaliseSkill(s.name))).length;
  const matched = matchedMust + matchedNice;
  return {
    score: round((matched / total) * max),
    max,
    detail: `${matchedMust}/${mustHaves.length} must-have, ${matchedNice}/${niceToHaves.length} nice-to-have skills matched`,
  };
}

/**
 * Experience dimension: full points at or above the minimum. Below it, points
 * fall linearly with the fraction of the requirement the candidate has met, so
 * a candidate with 3 of 5 required years keeps 60% of the points.
 */
export function scoreExperience(candidate: Candidate, job: Job, max: number): DimensionScore {
  const required = job.minYearsExperience;
  const actual = candidate.yearsOfExperience;
  if (required <= 0 || actual >= required) {
    return { score: max, max, detail: `${actual}y meets minimum of ${required}y` };
  }
  const ratio = Math.max(0, actual / required);
  return {
    score: round(ratio * max),
    max,
    detail: `${actual}y is below minimum of ${required}y (${Math.round(ratio * 100)}% of requirement)`,
  };
}

/**
 * Location dimension: exact match > remote allowed > mismatch.
 */
export function scoreLocation(candidate: Candidate, job: Job, max: number): DimensionScore {
  if (normaliseLocation(candidate.location) === normaliseLocation(job.location)) {
    return { score: max, max, detail: `exact location match (${job.location})` };
  }
  if (job.remoteAllowed) {
    return {
      score: round(max * SCORING_CONSTANTS.remoteLocationFactor),
      max,
      detail: `different location but remote allowed`,
    };
  }
  return { score: 0, max, detail: `location mismatch (${candidate.location} vs ${job.location}), not remote` };
}

/**
 * Salary dimension, based on where the expectation sits relative to the range:
 *  - whole range at or above expectation           -> full points
 *  - expectation inside the range                  -> linear from full (at min) down to 50% (at max)
 *  - max below expectation, within 10% tolerance   -> linear from 50% down to 0
 *  - max more than 10% below expectation           -> 0
 */
export function scoreSalary(candidate: Candidate, job: Job, max: number): DimensionScore {
  const expected = candidate.expectedSalary;
  const { min, max: rangeMax } = job.salaryRange;
  const { salaryAtMaxFactor, salaryShortfallTolerance } = SCORING_CONSTANTS;

  if (min >= expected) {
    return { score: max, max, detail: `entire range (${min}-${rangeMax}) is at or above expectation ${expected}` };
  }
  if (rangeMax >= expected) {
    const span = rangeMax - min;
    const headroom = span === 0 ? 0 : (rangeMax - expected) / span; // 1 at min, 0 at max
    const factor = salaryAtMaxFactor + (1 - salaryAtMaxFactor) * headroom;
    return {
      score: round(factor * max),
      max,
      detail: `expectation ${expected} falls inside range ${min}-${rangeMax}`,
    };
  }
  const shortfall = expected <= 0 ? 1 : (expected - rangeMax) / expected;
  if (shortfall < salaryShortfallTolerance) {
    const factor = salaryAtMaxFactor * (1 - shortfall / salaryShortfallTolerance);
    return {
      score: round(factor * max),
      max,
      detail: `range max ${rangeMax} is ${Math.round(shortfall * 100)}% below expectation ${expected}`,
    };
  }
  return { score: 0, max, detail: `range max ${rangeMax} is well below expectation ${expected}` };
}

/**
 * Full score for an eligible candidate/job pair. Callers must run
 * checkEligibility first; scoring an ineligible pair is a programming error.
 */
export function scoreMatch(candidate: Candidate, job: Job, weights: Partial<Weights> = {}): MatchResult {
  const w = normaliseWeights(weights);
  const breakdown: MatchBreakdown = {
    skills: scoreSkills(candidate, job, w.skills),
    experience: scoreExperience(candidate, job, w.experience),
    location: scoreLocation(candidate, job, w.location),
    salary: scoreSalary(candidate, job, w.salary),
  };
  const total = breakdown.skills.score + breakdown.experience.score + breakdown.location.score + breakdown.salary.score;
  return { score: clamp(round(total), 0, 100), breakdown };
}

export function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
