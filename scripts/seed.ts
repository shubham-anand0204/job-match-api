/**
 * Seeds a running API with a small, deliberately varied dataset so the
 * recommendation endpoints can be tried by hand.
 *
 *   npm run dev          # in one terminal
 *   npm run seed         # in another
 *
 * Override the target with BASE_URL=http://localhost:3010 npm run seed
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const candidates = [
  {
    name: 'Asha Rao',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
    yearsOfExperience: 5,
    location: 'Bengaluru',
    expectedSalary: 2_000_000,
  },
  {
    name: 'Vikram Shah',
    skills: ['TypeScript', 'React'],
    yearsOfExperience: 1,
    location: 'Pune',
    expectedSalary: 900_000,
  },
  {
    name: 'Meera Iyer',
    skills: ['Python', 'Django', 'PostgreSQL', 'Kubernetes'],
    yearsOfExperience: 8,
    location: 'Chennai',
    expectedSalary: 3_200_000,
  },
];

const jobs = [
  {
    title: 'Senior Backend Engineer',
    requiredSkills: [
      { name: 'TypeScript', importance: 'must-have' },
      { name: 'Node.js', importance: 'must-have' },
      { name: 'PostgreSQL', importance: 'nice-to-have' },
      { name: 'Kubernetes', importance: 'nice-to-have' },
    ],
    minYearsExperience: 4,
    location: 'Bengaluru',
    salaryRange: { min: 2_000_000, max: 2_800_000 },
    remoteAllowed: false,
  },
  {
    title: 'Remote Platform Engineer',
    requiredSkills: [
      { name: 'TypeScript', importance: 'must-have' },
      { name: 'Docker', importance: 'nice-to-have' },
    ],
    minYearsExperience: 3,
    location: 'Hyderabad',
    salaryRange: { min: 1_800_000, max: 2_400_000 },
    remoteAllowed: true,
  },
  {
    title: 'Rust Systems Engineer',
    requiredSkills: [{ name: 'Rust', importance: 'must-have' }],
    minYearsExperience: 2,
    location: 'Bengaluru',
    salaryRange: { min: 3_500_000, max: 4_500_000 },
    remoteAllowed: true,
  },
  {
    title: 'Junior Node Developer',
    requiredSkills: [{ name: 'TypeScript', importance: 'must-have' }],
    minYearsExperience: 0,
    location: 'Pune',
    salaryRange: { min: 600_000, max: 1_000_000 },
    remoteAllowed: false,
  },
  {
    title: 'Data Platform Engineer',
    requiredSkills: [
      { name: 'Python', importance: 'must-have' },
      { name: 'PostgreSQL', importance: 'must-have' },
      { name: 'Kubernetes', importance: 'nice-to-have' },
    ],
    minYearsExperience: 6,
    location: 'Chennai',
    salaryRange: { min: 3_000_000, max: 4_000_000 },
    remoteAllowed: false,
  },
];

async function post(path: string, body: unknown): Promise<{ id: string; name?: string; title?: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; name?: string; title?: string }>;
}

async function main(): Promise<void> {
  console.log(`Seeding ${BASE_URL}\n`);

  for (const job of jobs) {
    const created = await post('/jobs', job);
    console.log(`  job       ${created.id}  ${created.title}`);
  }

  const createdCandidates = [];
  for (const candidate of candidates) {
    const created = await post('/candidates', candidate);
    createdCandidates.push(created);
    console.log(`  candidate ${created.id}  ${created.name}`);
  }

  console.log('\nTry:');
  for (const c of createdCandidates) {
    console.log(`  curl -s "${BASE_URL}/candidates/${c.id}/recommendations?limit=3" | jq`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
