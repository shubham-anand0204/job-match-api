import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { buildOpenApiDocument } from '../src/docs/openapi.js';
import {
  candidateRecommendationsResponseSchema,
  candidateResponseSchema,
  errorResponseSchema,
  jobRecommendationsResponseSchema,
  jobResponseSchema,
} from '../src/domain/schemas.js';
import { createInMemoryRepositories } from '../src/repositories/memory.js';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp(createInMemoryRepositories());
});

const candidatePayload = {
  name: 'Asha Rao',
  skills: ['TypeScript', 'Node.js'],
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

describe('the published document', () => {
  const doc = buildOpenApiDocument();

  it('is a valid OpenAPI 3.1 document with a title and version', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Job Match API');
    expect(doc.info.version).toBeTruthy();
  });

  it('documents every route the app actually serves', () => {
    expect(Object.keys(doc.paths ?? {}).sort()).toEqual([
      '/candidates',
      '/candidates/{id}',
      '/candidates/{id}/recommendations',
      '/health',
      '/jobs',
      '/jobs/{id}',
      '/jobs/{id}/recommendations',
    ]);
  });

  it('documents the limit and weight query params on both recommendation endpoints', () => {
    for (const path of ['/candidates/{id}/recommendations', '/jobs/{id}/recommendations']) {
      const params = (doc.paths?.[path] as { get?: { parameters?: { name: string }[] } })?.get?.parameters ?? [];
      const names = params.map((p) => p.name);
      expect(names).toEqual(expect.arrayContaining(['id', 'limit', 'wSkills', 'wExperience', 'wLocation', 'wSalary']));
    }
  });

  it('is served as JSON at /openapi.json', async () => {
    const res = await request(app).get('/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toHaveLength(7);
  });

  it('serves interactive docs at /docs', async () => {
    const res = await request(app).get('/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });
});

// These are the tests that stop the contract from becoming a lie: they run real
// requests and assert the responses still satisfy the schemas we publish.
describe('real responses match the published schemas', () => {
  it('POST /candidates', async () => {
    const res = await request(app).post('/candidates').send(candidatePayload).expect(201);
    expect(() => candidateResponseSchema.parse(res.body)).not.toThrow();
  });

  it('POST /jobs', async () => {
    const res = await request(app).post('/jobs').send(jobPayload).expect(201);
    expect(() => jobResponseSchema.parse(res.body)).not.toThrow();
  });

  it('GET /candidates/:id/recommendations', async () => {
    const { body: candidate } = await request(app).post('/candidates').send(candidatePayload);
    await request(app).post('/jobs').send(jobPayload);

    const res = await request(app).get(`/candidates/${candidate.id}/recommendations`).expect(200);
    expect(() => jobRecommendationsResponseSchema.parse(res.body)).not.toThrow();
  });

  it('GET /jobs/:id/recommendations', async () => {
    await request(app).post('/candidates').send(candidatePayload);
    const { body: job } = await request(app).post('/jobs').send(jobPayload);

    const res = await request(app).get(`/jobs/${job.id}/recommendations`).expect(200);
    expect(() => candidateRecommendationsResponseSchema.parse(res.body)).not.toThrow();
  });

  it('a 400 validation failure', async () => {
    const res = await request(app).post('/candidates').send({ name: 'incomplete' }).expect(400);
    expect(() => errorResponseSchema.parse(res.body)).not.toThrow();
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('a 404', async () => {
    const res = await request(app).get('/candidates/00000000-0000-4000-8000-000000000000').expect(404);
    expect(() => errorResponseSchema.parse(res.body)).not.toThrow();
  });
});
