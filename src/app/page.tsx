import Greeting from '@/components/dashboard/Greeting';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import InboxCard from '@/components/dashboard/InboxCard';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Greeting />
        <QuickCaptureButton />
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <InboxCard />
        <RecentNotesCard />
      </div>
    </div>
  );
}
