import { randomUUID } from 'node:crypto';
import type { Candidate, Job, NewCandidate, NewJob } from '../domain/types.js';
import type { CandidateRepository, JobRepository, Repositories } from './repository.js';

class InMemoryStore<T extends { id: string }, TNew> {
  private readonly items = new Map<string, T>();

  async create(input: TNew): Promise<T> {
    const item = { id: randomUUID(), ...input } as unknown as T;
    this.items.set(item.id, item);
    return structuredClone(item);
  }

  async findById(id: string): Promise<T | null> {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }

  async findAll(): Promise<T[]> {
    return [...this.items.values()].map((i) => structuredClone(i));
  }
}

export function createInMemoryRepositories(): Repositories {
  const candidates: CandidateRepository = new InMemoryStore<Candidate, NewCandidate>();
  const jobs: JobRepository = new InMemoryStore<Job, NewJob>();
  return { candidates, jobs, init: async () => {}, close: async () => {} };
}
