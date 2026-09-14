import { describe, expect, it } from 'vitest';
import {
  checkEligibility,
  scoreExperience,
  scoreLocation,
  scoreMatch,
  scoreSalary,
  scoreSkills,
} from '../src/scoring/scorer.js';
import { DEFAULT_WEIGHTS, normaliseWeights } from '../src/scoring/weights.js';
import { makeCandidate, makeJob } from './fixtures.js';

describe('eligibility (must-have hard filter)', () => {
  it('is eligible when every must-have skill is present', () => {
    expect(checkEligibility(makeCandidate(), makeJob())).toEqual({ eligible: true, missingMustHaveSkills: [] });
  });

  it('is ineligible when a must-have skill is missing, even if everything else is perfect', () => {
    const job = makeJob({ requiredSkills: [{ name: 'Go', importance: 'must-have' }] });
    const result = checkEligibility(makeCandidate(), job);
    expect(result.eligible).toBe(false);
    expect(result.missingMustHaveSkills).toEqual(['Go']);
  });

  it('does not gate on missing nice-to-have skills', () => {
    const job = makeJob({ requiredSkills: [{ name: 'Go', importance: 'nice-to-have' }] });
    expect(checkEligibility(makeCandidate(), job).eligible).toBe(true);
  });

  it('matches skills case- and whitespace-insensitively', () => {
    const candidate = makeCandidate({ skills: ['  typescript ', 'NODE.JS'] });
    expect(checkEligibility(candidate, makeJob()).eligible).toBe(true);
  });
});

describe('skills dimension', () => {
  it('awards full points when all listed skills are matched', () => {
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Kubernetes'] });
    expect(scoreSkills(candidate, makeJob(), 50).score).toBe(50);
  });

  it('awards partial points proportional to nice-to-have coverage', () => {
    // 2 must-have matched + 1 of 2 nice-to-have = 3/4 of 50
    expect(scoreSkills(makeCandidate(), makeJob(), 50).score).toBe(37.5);
  });

  it('awards full points when the job lists no skills', () => {
    expect(scoreSkills(makeCandidate(), makeJob({ requiredSkills: [] }), 50).score).toBe(50);
  });

  it('nice-to-have skills boost the score but never reduce it below the must-have baseline', () => {
    const candidateNoNice = makeCandidate({ skills: ['TypeScript', 'Node.js'] });
    const candidateOneNice = makeCandidate({ skills: ['TypeScript', 'Node.js', 'Kubernetes'] });
    const low = scoreSkills(candidateNoNice, makeJob(), 50).score;
    const high = scoreSkills(candidateOneNice, makeJob(), 50).score;
    expect(low).toBe(25);
    expect(high).toBeGreaterThan(low);
  });
});

describe('experience dimension', () => {
  it('awards full points at exactly the minimum', () => {
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 3 }), makeJob(), 20).score).toBe(20);
  });

  it('awards full points above the minimum (no bonus for over-qualification)', () => {
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 15 }), makeJob(), 20).score).toBe(20);
  });

  it('penalises but does not zero a candidate below the minimum', () => {
    // 2 of 3 years -> 66.7% of 20 = 13.3
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 2 }), makeJob(), 20).score).toBe(13.3);
  });

  it('gives zero to a candidate with no experience for a job that requires some', () => {
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 0 }), makeJob(), 20).score).toBe(0);
  });

  it('awards full points when the job has no minimum', () => {
    const job = makeJob({ minYearsExperience: 0 });
    expect(scoreExperience(makeCandidate({ yearsOfExperience: 0 }), job, 20).score).toBe(20);
  });
});

describe('location dimension', () => {
  it('exact match scores highest', () => {
    expect(scoreLocation(makeCandidate(), makeJob(), 15).score).toBe(15);
  });

  it('remote-allowed scores between exact match and mismatch', () => {
    const remote = makeJob({ location: 'Pune', remoteAllowed: true });
    const score = scoreLocation(makeCandidate(), remote, 15).score;
    expect(score).toBe(10.5);
    expect(score).toBeLessThan(15);
    expect(score).toBeGreaterThan(0);
  });

  it('mismatch without remote scores zero', () => {
    const job = makeJob({ location: 'Pune', remoteAllowed: false });
    expect(scoreLocation(makeCandidate(), job, 15).score).toBe(0);
  });

  it('exact match beats remote even when remote is allowed', () => {
    const job = makeJob({ remoteAllowed: true });
    expect(scoreLocation(makeCandidate(), job, 15).score).toBe(15);
  });

  it('compares locations case-insensitively', () => {
    expect(scoreLocation(makeCandidate({ location: 'bengaluru ' }), makeJob(), 15).score).toBe(15);
  });
});

describe('salary dimension', () => {
  const expecting = (expectedSalary: number) => makeCandidate({ expectedSalary });
  const range = (min: number, max: number) => makeJob({ salaryRange: { min, max } });

  it('scores highest when the whole range is at or above expectation', () => {
    expect(scoreSalary(expecting(100), range(100, 150), 15).score).toBe(15);
    expect(scoreSalary(expecting(100), range(120, 150), 15).score).toBe(15);
  });

  it('scores between 50% and 100% when expectation is inside the range', () => {
    // expectation at midpoint of range -> 75%
    expect(scoreSalary(expecting(125), range(100, 150), 15).score).toBe(11.3);
  });

  it('scores 50% when expectation equals the range max', () => {
    expect(scoreSalary(expecting(150), range(100, 150), 15).score).toBe(7.5);
  });

  it('scores near zero when the range max is slightly below expectation', () => {
    // 5% below -> half of the 50% floor = 25%
    expect(scoreSalary(expecting(100), range(50, 95), 15).score).toBe(3.8);
  });

  it('scores zero when there is no overlap and the gap exceeds the tolerance', () => {
    expect(scoreSalary(expecting(100), range(50, 80), 15).score).toBe(0);
  });

  it('handles a zero-width range', () => {
    expect(scoreSalary(expecting(100), range(100, 100), 15).score).toBe(15);
    expect(scoreSalary(expecting(90), range(100, 100), 15).score).toBe(15);
  });

  it('is monotonic: a higher range max never scores lower', () => {
    const scores = [80, 92, 99, 100, 120, 150, 200].map((max) => scoreSalary(expecting(100), range(50, max), 15).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });
});

describe('overall match score', () => {
  it('is 100 for a perfect match', () => {
    const candidate = makeCandidate({ skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Kubernetes'], expectedSalary: 1_800_000 });
    const result = scoreMatch(candidate, makeJob());
    expect(result.score).toBe(100);
    expect(result.breakdown.skills.max + result.breakdown.experience.max + result.breakdown.location.max + result.breakdown.salary.max).toBe(100);
  });

  it('sums the dimension scores', () => {
    const result = scoreMatch(makeCandidate(), makeJob());
    const { skills, experience, location, salary } = result.breakdown;
    expect(result.score).toBeCloseTo(skills.score + experience.score + location.score + salary.score, 1);
  });

  it('exposes a readable breakdown with max per dimension', () => {
    const { breakdown } = scoreMatch(makeCandidate(), makeJob());
    expect(breakdown.skills.max).toBe(DEFAULT_WEIGHTS.skills);
    expect(breakdown.skills.detail).toContain('must-have');
  });

  it('is never above 100 or below 0', () => {
    const worst = makeCandidate({ skills: ['TypeScript', 'Node.js'], yearsOfExperience: 0, location: 'Mars', expectedSalary: 99_000_000 });
    expect(scoreMatch(worst, makeJob()).score).toBe(25); // only the two must-have skills contribute
  });
});

describe('configurable weights', () => {
  it('defaults sum to 100', () => {
    const w = normaliseWeights();
    expect(w.skills + w.experience + w.location + w.salary).toBe(100);
  });

  it('normalises arbitrary positive weights to 100', () => {
    const w = normaliseWeights({ skills: 2, experience: 1, location: 1, salary: 1 });
    expect(w).toEqual({ skills: 40, experience: 20, location: 20, salary: 20 });
  });

  it('allows a dimension to be switched off with a zero weight', () => {
    const candidate = makeCandidate({ location: 'Mars' });
    const withLocation = scoreMatch(candidate, makeJob()).score;
    const withoutLocation = scoreMatch(candidate, makeJob(), { location: 0 }).score;
    expect(withoutLocation).toBeGreaterThan(withLocation);
  });

  it('rejects negative weights and all-zero weights', () => {
    expect(() => normaliseWeights({ skills: -1 })).toThrow();
    expect(() => normaliseWeights({ skills: 0, experience: 0, location: 0, salary: 0 })).toThrow();
  });
});
