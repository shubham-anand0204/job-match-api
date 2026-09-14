import { createApp } from './app.js';
import { createInMemoryRepositories } from './repositories/memory.js';

const port = Number(process.env.PORT ?? 3000);
const repos = createInMemoryRepositories();
const app = createApp(repos);

const server = app.listen(port, () => {
  console.log(`Job Match API listening on http://localhost:${port} (storage: in-memory)`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await repos.close();
      process.exit(0);
    });
  });
}
