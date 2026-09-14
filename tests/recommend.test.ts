import { describe, expect, it } from 'vitest';
import { recommendCandidates, recommendJobs } from '../src/scoring/recommend.js';
import { makeCandidate, makeJob } from './fixtures.js';

describe('recommendJobs', () => {
  const candidate = makeCandidate();
  const perfect = makeJob({ id: 'perfect', title: 'Perfect', requiredSkills: [{ name: 'TypeScript', importance: 'must-have' }], salaryRange: { min: 2_000_000, max: 3_000_000 } });
  const remote = makeJob({ id: 'remote', title: 'Remote', location: 'Pune', remoteAllowed: true });
  const gated = makeJob({ id: 'gated', title: 'Gated', requiredSkills: [{ name: 'Rust', importance: 'must-have' }] });
  const lowPay = makeJob({ id: 'lowpay', title: 'Low pay', salaryRange: { min: 500_000, max: 800_000 } });

  it('excludes jobs missing a must-have skill regardless of other fit', () => {
    const results = recommendJobs(candidate, [perfect, gated]);
    expect(results.map((r) => r.job.id)).toEqual(['perfect']);
  });

  it('ranks jobs by score descending', () => {
    const results = recommendJobs(candidate, [lowPay, remote, perfect]);
    expect(results.map((r) => r.job.id)).toEqual(['perfect', 'remote', 'lowpay']);
    for (let i = 1; i < results.length; i++) expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
  });

  it('respects the limit', () => {
    expect(recommendJobs(candidate, [lowPay, remote, perfect], { limit: 2 })).toHaveLength(2);
    expect(recommendJobs(candidate, [lowPay, remote, perfect], { limit: 0 })).toHaveLength(0);
  });

  it('returns an empty list when no jobs are eligible', () => {
    expect(recommendJobs(candidate, [gated])).toEqual([]);
  });

  it('applies custom weights to the ranking', () => {
    // With location weighted heavily, the exact-location low-pay job overtakes the remote job.
    const results = recommendJobs(candidate, [remote, lowPay], { weights: { skills: 0, experience: 0, location: 100, salary: 0 } });
    expect(results[0].job.id).toBe('lowpay');
  });
});

describe('recommendCandidates (reverse view)', () => {
  const job = makeJob();
  const strong = makeCandidate({ id: 'strong', name: 'Strong', skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Kubernetes'] });
  const junior = makeCandidate({ id: 'junior', name: 'Junior', yearsOfExperience: 1 });
  const missingMustHave = makeCandidate({ id: 'missing', name: 'Missing', skills: ['Python'] });

  it('filters out candidates missing a must-have and ranks the rest', () => {
    const results = recommendCandidates(job, [junior, missingMustHave, strong]);
    expect(results.map((r) => r.candidate.id)).toEqual(['strong', 'junior']);
  });

  it('respects the limit', () => {
    expect(recommendCandidates(job, [junior, strong], { limit: 1 })[0].candidate.id).toBe('strong');
  });
});
