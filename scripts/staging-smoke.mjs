const origin = (process.env.STAGING_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/u, '');
const checks = [
  '/api/health/live',
  '/api/health/ready',
  '/',
  '/search',
  '/categories',
  '/cart',
  '/checkout',
  '/orders/track',
  '/admin',
  '/admin/operations',
  '/admin/integrity',
  '/admin/analytics',
  '/admin/team',
  '/admin/notifications',
  '/admin/integrations',
];
let failed = false;
for (const path of checks) {
  try {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    const accepted = response.status >= 200 && response.status < 400;
    console.log(`${accepted ? 'PASS' : 'FAIL'} ${path} ${response.status}`);
    failed ||= !accepted;
  } catch (error) {
    console.log(`FAIL ${path} ${error instanceof Error ? error.message : 'network error'}`);
    failed = true;
  }
}
if (failed) process.exit(1);
