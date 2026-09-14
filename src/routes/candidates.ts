import { Router } from 'express';
import { candidateSchema } from '../domain/schemas.js';
import { notFound } from '../errors.js';
import type { Repositories } from '../repositories/repository.js';

export function candidatesRouter(repos: Repositories): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const input = candidateSchema.parse(req.body);
      const candidate = await repos.candidates.create(input);
      res.status(201).json(candidate);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await repos.candidates.findAll());
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const candidate = await repos.candidates.findById(req.params.id);
      if (!candidate) throw notFound('Candidate', req.params.id);
      res.json(candidate);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
