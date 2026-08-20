import { loadConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createOrganization, createOwnerMembership } from '@maevelle/database/platform';

import { createAuth } from './auth/auth.js';

const email = process.env.BOOTSTRAP_OWNER_EMAIL;
const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
const organizationCode = process.env.BOOTSTRAP_ORGANIZATION_CODE;
const organizationName = process.env.BOOTSTRAP_ORGANIZATION_NAME;

if (!email || !password || !organizationCode || !organizationName) {
  throw new Error(
    'BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD, BOOTSTRAP_ORGANIZATION_CODE, and BOOTSTRAP_ORGANIZATION_NAME are required.',
  );
}

const config = loadConfig();
const database = createDatabase({
  connectionString: config.databaseUrl,
  maxConnections: 1,
});

try {
  const auth = createAuth(config, database, true);
  // Programmatic bootstrap is deliberately separate from the public sign-up route.
  const result = await auth.api.signUpEmail({
    body: { email, password, name: organizationName },
  });
  const userId = result.user?.id;
  if (!userId) throw new Error('Bootstrap owner creation did not return a user id.');

  const organization = await createOrganization(database.db, {
    code: organizationCode,
    displayName: organizationName,
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en-BD',
    defaultCurrency: 'BDT',
  });
  await createOwnerMembership(database.db, organization.id, userId, organizationName);
  console.log('Bootstrap owner created. Do not rerun this command for the same organization.');
} finally {
  await database.close();
}
