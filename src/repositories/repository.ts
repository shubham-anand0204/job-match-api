import type { Candidate, Job, NewCandidate, NewJob } from '../domain/types.js';

export interface CandidateRepository {
  create(input: NewCandidate): Promise<Candidate>;
  findById(id: string): Promise<Candidate | null>;
  findAll(): Promise<Candidate[]>;
}

export interface JobRepository {
  create(input: NewJob): Promise<Job>;
  findById(id: string): Promise<Job | null>;
  findAll(): Promise<Job[]>;
}

export interface Repositories {
  candidates: CandidateRepository;
  jobs: JobRepository;
  /**
   * Prepare the store before it serves traffic. For Postgres this applies the
   * schema; for the in-memory store there is nothing to do. Callers must await
   * it before listening.
   */
  init(): Promise<void>;
  /** Release any underlying connections. */
  close(): Promise<void>;
}
