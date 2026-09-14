/**
 * Scoring weights. Each value is the maximum number of points a dimension can
 * contribute. They are normalised so the total is always 100, which means the
 * caller can pass any positive numbers (e.g. 2/1/1/1) and still get a 0-100 score.
 */
export interface Weights {
  skills: number;
  experience: number;
  location: number;
  salary: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  skills: 50,
  experience: 20,
  location: 15,
  salary: 15,
};

export const TOTAL_POINTS = 100;

export function normaliseWeights(partial: Partial<Weights> = {}): Weights {
  const merged: Weights = { ...DEFAULT_WEIGHTS, ...stripUndefined(partial) };
  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Weight "${key}" must be a non-negative number`);
    }
  }
  const sum = merged.skills + merged.experience + merged.location + merged.salary;
  if (sum <= 0) throw new Error('At least one weight must be greater than zero');
  const factor = TOTAL_POINTS / sum;
  return {
    skills: merged.skills * factor,
    experience: merged.experience * factor,
    location: merged.location * factor,
    salary: merged.salary * factor,
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
