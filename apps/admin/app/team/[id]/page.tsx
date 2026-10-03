import { TeamMemberDetailConsole } from '@/components/team/team-member-detail-console';

export default async function TeamMemberDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TeamMemberDetailConsole memberId={id} />;
}
