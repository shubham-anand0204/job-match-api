import { createInMemoryRepositories } from './memory.js';
import { createPostgresRepositories } from './postgres.js';
import type { Repositories } from './repository.js';

/**
 * Storage is chosen by environment: Postgres when DATABASE_URL is set,
 * in-memory otherwise. This keeps `npm start` working with zero setup while
 * docker-compose gets real persistence, without any branching in the routes.
 */
export function createRepositories(): { repos: Repositories; driver: 'postgres' | 'in-memory' } {
  const url = process.env.DATABASE_URL;
  return url
    ? { repos: createPostgresRepositories(url), driver: 'postgres' }
    : { repos: createInMemoryRepositories(), driver: 'in-memory' };
}
