import express, { type Express } from 'express';
import { errorHandler } from './errors.js';
import type { Repositories } from './repositories/repository.js';
import { candidatesRouter } from './routes/candidates.js';
import { jobsRouter } from './routes/jobs.js';
import { candidateRecommendationsRouter, jobRecommendationsRouter } from './routes/recommendations.js';

export function createApp(repos: Repositories): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/candidates', candidateRecommendationsRouter(repos));
  app.use('/candidates', candidatesRouter(repos));
  app.use('/jobs', jobRecommendationsRouter(repos));
  app.use('/jobs', jobsRouter(repos));

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
