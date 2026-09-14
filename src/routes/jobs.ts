import { Router } from 'express';
import { jobSchema } from '../domain/schemas.js';
import { notFound } from '../errors.js';
import type { Repositories } from '../repositories/repository.js';

export function jobsRouter(repos: Repositories): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const input = jobSchema.parse(req.body);
      const job = await repos.jobs.create(input);
      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await repos.jobs.findAll());
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const job = await repos.jobs.findById(req.params.id);
      if (!job) throw notFound('Job', req.params.id);
      res.json(job);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
