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
  /** Release any underlying connections. */
  close(): Promise<void>;
}
