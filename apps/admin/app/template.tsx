import { requireAdminAccess } from '@/lib/auth/server-access';

export default async function AdminTemplate({ children }: { children: React.ReactNode }) {
  // Templates participate in navigation even when the root layout remains mounted.
  await requireAdminAccess();
  return children;
}
