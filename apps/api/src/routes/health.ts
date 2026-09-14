// Import the Fastify application type.
import type { FastifyInstance } from 'fastify';

// Import TypeBox for defining runtime validation schemas.
import { Type } from 'typebox';

// Import the database client type.
import type { DatabaseClient } from '@maevelle/database';

// Define the response schema for a successful health check.
const healthOkResponseSchema = Type.Object({
  // The status must always be exactly "ok".
  status: Type.Literal('ok'),
});

// Define the response schema for an unavailable health check.
const healthUnavailableResponseSchema = Type.Object({
  // The status must always be exactly "unavailable".
  status: Type.Literal('unavailable'),
});

// Register all health-related routes.
export function registerHealthRoutes(
  // Receive the Fastify application instance.
  app: FastifyInstance,
  // Receive the database client through dependency injection.
  database: DatabaseClient,
): void {
  // Register the liveness health-check endpoint.
  app.get(
    // Define the liveness endpoint path.
    '/health/live',
    {
      // Define the route schema.
      schema: {
        // Define the possible response schemas.
        response: {
          // Return HTTP 200 when the application process is alive.
          200: healthOkResponseSchema,
        },
      },
    },
    // Handle the liveness request.
    async () => {
      // Return a successful liveness response.
      return { status: 'ok' };
    },
  );

  // Register the readiness health-check endpoint.
  app.get(
    // Define the readiness endpoint path.
    '/health/ready',
    {
      // Define the route schema.
      schema: {
        // Define the possible response schemas.
        response: {
          // Return HTTP 200 when the application is ready.
          200: healthOkResponseSchema,
          // Return HTTP 503 when a required dependency is unavailable.
          503: healthUnavailableResponseSchema,
        },
      },
    },
    // Handle the readiness request.
    async (request, reply) => {
      // Attempt to verify that PostgreSQL is available.
      try {
        // Send a lightweight ping to the database.
        await database.ping();

        // Return a successful readiness response.
        return { status: 'ok' };
      } catch (error) {
        // Log the database failure for internal monitoring and debugging.
        request.log.error(
          { err: error },
          'PostgreSQL readiness check failed.',
        );

        // Return HTTP 503 so the instance is treated as not ready.
        return reply.code(503).send({ status: 'unavailable' });
      }
    },
  );
}