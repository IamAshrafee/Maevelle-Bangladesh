import type { DatabaseClient } from '@maevelle/database';
import { findActiveAdminContext } from '@maevelle/database/platform';
import type { createAuth } from '../auth/auth.js';

type Auth = ReturnType<typeof createAuth>;
type AnalyticsCapability =
  'analytics.view' | 'analytics.manage' | 'analytics.financial.view' | 'analytics.export';

function headers(source: Record<string, string | string[] | undefined>): Headers {
  return new Headers(
    Object.entries(source).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

export async function analyticsAdmin(
  database: DatabaseClient,
  auth: Auth,
  source: Record<string, string | string[] | undefined>,
  capability: AnalyticsCapability,
) {
  if (
    typeof source['x-organization-id'] === 'string' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      source['x-organization-id'],
    )
  )
    return undefined;
  const session = await auth.api.getSession({ headers: headers(source) });
  if (!session?.user?.id) return undefined;
  const context = await findActiveAdminContext(database.db, session.user.id, {
    requiredCapability: capability,
    ...(typeof source['x-organization-id'] === 'string'
      ? { organizationId: source['x-organization-id'] }
      : {}),
  });
  return context ? { ...context, actorId: session.user.id } : undefined;
}
