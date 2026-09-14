-- Schema for the Job Match API.
-- Skills are stored inline (text[] / jsonb) rather than in join tables: the
-- scorer always loads the whole skill list for a row, never queries across
-- skills, so normalising them would add joins without buying anything.

CREATE TABLE IF NOT EXISTS candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  skills              TEXT[]      NOT NULL,
  years_of_experience NUMERIC     NOT NULL CHECK (years_of_experience >= 0),
  location            TEXT        NOT NULL,
  expected_salary     NUMERIC     NOT NULL CHECK (expected_salary > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT        NOT NULL,
  -- [{ "name": "TypeScript", "importance": "must-have" }, ...]
  required_skills       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  min_years_experience  NUMERIC     NOT NULL CHECK (min_years_experience >= 0),
  location              TEXT        NOT NULL,
  salary_min            NUMERIC     NOT NULL CHECK (salary_min >= 0),
  salary_max            NUMERIC     NOT NULL CHECK (salary_max >= salary_min),
  remote_allowed        BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_location_idx       ON jobs (lower(location));
CREATE INDEX IF NOT EXISTS candidates_location_idx ON candidates (lower(location));
