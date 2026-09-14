export type SkillImportance = 'must-have' | 'nice-to-have';

export interface RequiredSkill {
  name: string;
  importance: SkillImportance;
}

export interface SalaryRange {
  min: number;
  max: number;
}

export interface Candidate {
  id: string;
  name: string;
  skills: string[];
  yearsOfExperience: number;
  location: string;
  expectedSalary: number;
}

export interface Job {
  id: string;
  title: string;
  requiredSkills: RequiredSkill[];
  minYearsExperience: number;
  location: string;
  salaryRange: SalaryRange;
  remoteAllowed: boolean;
}

export type NewCandidate = Omit<Candidate, 'id'>;
export type NewJob = Omit<Job, 'id'>;
