import { notFound } from 'next/navigation';
import DashboardPage from '../../dashboard/page';
import ReviewPage from '../../review/page';
import InterviewPage from '../../interview/page';
import ManagementPage from '../../management/page';
import AcademyPage from '../../academy/page';
import PlacementPage from '../../placement/page';
import AuditLogsPage from '../../audit-logs/page';

const pages = {
  dashboard: DashboardPage,
  review: ReviewPage,
  interview: InterviewPage,
  management: ManagementPage,
  academy: AcademyPage,
  absensi: AcademyPage,
  placement: PlacementPage,
  'audit-log': AuditLogsPage,
};

export default async function BatchWorkspacePage({ params }) {
  const { section } = await params;
  const Page = pages[section];
  if (!Page) notFound();
  return <Page />;
}
