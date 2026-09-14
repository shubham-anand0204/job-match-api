import type { Candidate, Job } from '../src/domain/types.js';

export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cand-1',
    name: 'Asha Rao',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    yearsOfExperience: 5,
    location: 'Bengaluru',
    expectedSalary: 2_000_000,
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    title: 'Backend Engineer',
    requiredSkills: [
      { name: 'TypeScript', importance: 'must-have' },
      { name: 'Node.js', importance: 'must-have' },
      { name: 'PostgreSQL', importance: 'nice-to-have' },
      { name: 'Kubernetes', importance: 'nice-to-have' },
    ],
    minYearsExperience: 3,
    location: 'Bengaluru',
    salaryRange: { min: 1_800_000, max: 2_600_000 },
    remoteAllowed: false,
    ...overrides,
  };
}
