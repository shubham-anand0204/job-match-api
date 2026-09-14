import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createInMemoryRepositories } from '../src/repositories/memory.js';

const candidatePayload = {
  name: 'Asha Rao',
  skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
  yearsOfExperience: 5,
  location: 'Bengaluru',
  expectedSalary: 2_000_000,
};

const jobPayload = {
  title: 'Backend Engineer',
  requiredSkills: [
    { name: 'TypeScript', importance: 'must-have' as const },
    { name: 'Kubernetes', importance: 'nice-to-have' as const },
  ],
  minYearsExperience: 3,
  location: 'Bengaluru',
  salaryRange: { min: 1_800_000, max: 2_600_000 },
  remoteAllowed: false,
};

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(createInMemoryRepositories());
});

const createCandidate = (overrides = {}) =>
  request(app).post('/candidates').send({ ...candidatePayload, ...overrides }).expect(201);
const createJob = (overrides = {}) =>
  request(app).post('/jobs').send({ ...jobPayload, ...overrides }).expect(201);

describe('POST /candidates', () => {
  it('creates a candidate and assigns an id', async () => {
    const res = await createCandidate();
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.name).toBe('Asha Rao');
  });

  it('rejects a candidate with no skills', async () => {
    const res = await request(app).post('/candidates').send({ ...candidatePayload, skills: [] }).expect(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details[0].path).toBe('skills');
  });

  it('rejects a missing required field', async () => {
    await request(app).post('/candidates').send({ name: 'No skills' }).expect(400);
  });
});

describe('POST /jobs', () => {
  it('creates a job', async () => {
    const res = await createJob();
    expect(res.body.id).toBeTruthy();
    expect(res.body.requiredSkills).toHaveLength(2);
  });

  it('rejects an inverted salary range', async () => {
    const res = await request(app)
      .post('/jobs')
      .send({ ...jobPayload, salaryRange: { min: 100, max: 50 } })
      .expect(400);
    expect(res.body.details[0].message).toMatch(/max must be >= /);
  });

  it('rejects an unknown skill importance', async () => {
    await request(app)
      .post('/jobs')
      .send({ ...jobPayload, requiredSkills: [{ name: 'Go', importance: 'would-be-nice' }] })
      .expect(400);
  });
});

describe('GET /candidates/:id/recommendations', () => {
  it('returns a ranked list with a breakdown that sums to the score', async () => {
    const { body: candidate } = await createCandidate();
    await createJob();

    const res = await request(app).get(`/candidates/${candidate.id}/recommendations`).expect(200);
    expect(res.body.recommendations).toHaveLength(1);

    const [rec] = res.body.recommendations;
    const { skills, experience, location, salary } = rec.breakdown;
    expect(skills.score + experience.score + location.score + salary.score).toBeCloseTo(rec.score, 1);
    expect(skills.max + experience.max + location.max + salary.max).toBe(100);
    expect(rec.breakdown.skills.detail).toContain('must-have');
  });

  it('never returns a job whose must-have skill the candidate lacks', async () => {
    const { body: candidate } = await createCandidate();
    // A far better job on every other axis, but requires Rust.
    await createJob({
      title: 'Rust Engineer',
      requiredSkills: [{ name: 'Rust', importance: 'must-have' }],
      salaryRange: { min: 4_000_000, max: 5_000_000 },
      remoteAllowed: true,
    });

    const res = await request(app).get(`/candidates/${candidate.id}/recommendations`).expect(200);
    expect(res.body.recommendations).toEqual([]);
    expect(res.body.totalEligible).toBe(0);
  });

  it('orders results by score descending', async () => {
    const { body: candidate } = await createCandidate();
    await createJob({ title: 'Great fit' });
    await createJob({ title: 'Poor pay', salaryRange: { min: 400_000, max: 600_000 } });
    await createJob({ title: 'Wrong city', location: 'Chennai', remoteAllowed: false });

    const res = await request(app).get(`/candidates/${candidate.id}/recommendations`).expect(200);
    const scores = res.body.recommendations.map((r: { score: number }) => r.score);
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
    expect(res.body.recommendations[0].title).toBe('Great fit');
  });

  it('honours the limit query param and still reports the eligible total', async () => {
    const { body: candidate } = await createCandidate();
    await createJob({ title: 'A' });
    await createJob({ title: 'B' });
    await createJob({ title: 'C' });

    const res = await request(app).get(`/candidates/${candidate.id}/recommendations?limit=2`).expect(200);
    expect(res.body.count).toBe(2);
    expect(res.body.totalEligible).toBe(3);
  });

  it('applies custom weights and echoes the normalised values', async () => {
    const { body: candidate } = await createCandidate();
    await createJob();

    const res = await request(app)
      .get(`/candidates/${candidate.id}/recommendations?wSkills=1&wExperience=1&wLocation=1&wSalary=1`)
      .expect(200);
    expect(res.body.weights).toEqual({ skills: 25, experience: 25, location: 25, salary: 25 });
  });

  it('rejects an all-zero weight set with 400 rather than failing', async () => {
    const { body: candidate } = await createCandidate();
    await request(app)
      .get(`/candidates/${candidate.id}/recommendations?wSkills=0&wExperience=0&wLocation=0&wSalary=0`)
      .expect(400);
  });

  it('rejects a negative limit', async () => {
    const { body: candidate } = await createCandidate();
    await request(app).get(`/candidates/${candidate.id}/recommendations?limit=-1`).expect(400);
  });

  it('returns 404 for an unknown candidate', async () => {
    const res = await request(app).get('/candidates/does-not-exist/recommendations').expect(404);
    expect(res.body.error).toMatch(/not found/);
  });
});

describe('GET /jobs/:id/recommendations (reverse view)', () => {
  it('ranks candidates and filters out those missing a must-have', async () => {
    const { body: job } = await createJob();
    await createCandidate({ name: 'Strong', skills: ['TypeScript', 'Kubernetes'] });
    await createCandidate({ name: 'Weaker', skills: ['TypeScript'], yearsOfExperience: 1 });
    await createCandidate({ name: 'Ineligible', skills: ['COBOL'] });

    const res = await request(app).get(`/jobs/${job.id}/recommendations`).expect(200);
    expect(res.body.recommendations.map((r: { name: string }) => r.name)).toEqual(['Strong', 'Weaker']);
  });

  it('returns 404 for an unknown job', async () => {
    await request(app).get('/jobs/nope/recommendations').expect(404);
  });
});

describe('misc', () => {
  it('reports health', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });

  it('returns a JSON 404 for an unknown route', async () => {
    const res = await request(app).get('/nope').expect(404);
    expect(res.body.error).toBe('Route not found');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/candidates').set('content-type', 'application/json').send('{oops').expect(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });
});
