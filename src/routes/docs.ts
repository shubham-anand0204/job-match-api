import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../docs/openapi.js';

/**
 * Serves the API contract.
 *
 *   GET /openapi.json  the raw OpenAPI 3.1 document
 *   GET /docs          an interactive Swagger UI over it
 *
 * The document is generated from the same Zod schemas that validate real
 * requests, so it cannot drift from the implementation. It is built once at
 * startup rather than per request.
 */
export function docsRouter(): Router {
  const document = buildOpenApiDocument();
  const router = Router();

  router.get('/openapi.json', (_req, res) => res.json(document));
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Job Match API',
      swaggerOptions: { defaultModelsExpandDepth: 2, docExpansion: 'list' },
    }),
  );

  return router;
}
