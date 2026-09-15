import { Pool } from 'pg';
import type { Candidate, Job, NewCandidate, NewJob, RequiredSkill } from '../domain/types.js';
import type { CandidateRepository, JobRepository, Repositories } from './repository.js';
import { SCHEMA_SQL } from './schema.js';

interface CandidateRow {
  id: string;
  name: string;
  skills: string[];
  years_of_experience: string;
  location: string;
  expected_salary: string;
}

interface JobRow {
  id: string;
  title: string;
  required_skills: RequiredSkill[];
  min_years_experience: string;
  location: string;
  salary_min: string;
  salary_max: string;
  remote_allowed: boolean;
}

// NUMERIC comes back from pg as a string to avoid precision loss. The values
// here are years and salaries, both well within the safe integer range, so
// converting to number is safe and keeps the domain types clean.
const toCandidate = (r: CandidateRow): Candidate => ({
  id: r.id,
  name: r.name,
  skills: r.skills,
  yearsOfExperience: Number(r.years_of_experience),
  location: r.location,
  expectedSalary: Number(r.expected_salary),
});

const toJob = (r: JobRow): Job => ({
  id: r.id,
  title: r.title,
  requiredSkills: r.required_skills,
  minYearsExperience: Number(r.min_years_experience),
  location: r.location,
  salaryRange: { min: Number(r.salary_min), max: Number(r.salary_max) },
  remoteAllowed: r.remote_allowed,
});

const CANDIDATE_COLUMNS = 'id, name, skills, years_of_experience, location, expected_salary';
const JOB_COLUMNS =
  'id, title, required_skills, min_years_experience, location, salary_min, salary_max, remote_allowed';

export function createPostgresRepositories(connectionString: string): Repositories {
  const pool = new Pool({ connectionString });

  const candidates: CandidateRepository = {
    async create(input: NewCandidate): Promise<Candidate> {
      const { rows } = await pool.query<CandidateRow>(
        `INSERT INTO candidates (name, skills, years_of_experience, location, expected_salary)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${CANDIDATE_COLUMNS}`,
        [input.name, input.skills, input.yearsOfExperience, input.location, input.expectedSalary],
      );
      return toCandidate(rows[0]);
    },
    async findById(id: string): Promise<Candidate | null> {
      if (!isUuid(id)) return null; // a non-UUID id would make Postgres throw, not return empty
      const { rows } = await pool.query<CandidateRow>(
        `SELECT ${CANDIDATE_COLUMNS} FROM candidates WHERE id = $1`,
        [id],
      );
      return rows[0] ? toCandidate(rows[0]) : null;
    },
    async findAll(): Promise<Candidate[]> {
      const { rows } = await pool.query<CandidateRow>(
        `SELECT ${CANDIDATE_COLUMNS} FROM candidates ORDER BY created_at`,
      );
      return rows.map(toCandidate);
    },
  };

  const jobs: JobRepository = {
    async create(input: NewJob): Promise<Job> {
      const { rows } = await pool.query<JobRow>(
        `INSERT INTO jobs (title, required_skills, min_years_experience, location, salary_min, salary_max, remote_allowed)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7) RETURNING ${JOB_COLUMNS}`,
        [
          input.title,
          JSON.stringify(input.requiredSkills),
          input.minYearsExperience,
          input.location,
          input.salaryRange.min,
          input.salaryRange.max,
          input.remoteAllowed,
        ],
      );
      return toJob(rows[0]);
    },
    async findById(id: string): Promise<Job | null> {
      if (!isUuid(id)) return null;
      const { rows } = await pool.query<JobRow>(`SELECT ${JOB_COLUMNS} FROM jobs WHERE id = $1`, [id]);
      return rows[0] ? toJob(rows[0]) : null;
    },
    async findAll(): Promise<Job[]> {
      const { rows } = await pool.query<JobRow>(`SELECT ${JOB_COLUMNS} FROM jobs ORDER BY created_at`);
      return rows.map(toJob);
    },
  };

  /**
   * Applies the schema. Every statement is idempotent, so this is safe to run on
   * every boot and against an already-populated database. It means the API can
   * be pointed at any empty Postgres — including a managed instance with no way
   * to run an init script — and come up working.
   */
  const init = async (): Promise<void> => {
    await pool.query(SCHEMA_SQL);
  };

  return { candidates, jobs, init, close: () => pool.end() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string): boolean => UUID_RE.test(s);
