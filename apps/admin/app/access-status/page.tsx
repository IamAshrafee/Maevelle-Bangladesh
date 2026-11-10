import { AdminAccessFeedback } from '@/components/security/admin-access-feedback';
import { safeAdminReturnUrl } from '@/lib/auth/access-policy';

export default async function AccessStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const denied = params.reason === 'ACCESS_DENIED';
  return (
    <AdminAccessFeedback
      reason={denied ? 'ACCESS_DENIED' : 'AUTH_UNAVAILABLE'}
      returnTo={denied ? '/admin' : safeAdminReturnUrl(params.redirect)}
    />
  );
}
