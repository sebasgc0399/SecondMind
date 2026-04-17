import Greeting from '@/components/dashboard/Greeting';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import InboxCard from '@/components/dashboard/InboxCard';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';
import TasksTodayCard from '@/components/dashboard/TasksTodayCard';
import ProjectsActiveCard from '@/components/dashboard/ProjectsActiveCard';
import HabitsTodayCard from '@/components/dashboard/HabitsTodayCard';
import DailyDigest from '@/components/dashboard/DailyDigest';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 md:mb-8">
        <Greeting />
        <div className="hidden md:block">
          <QuickCaptureButton />
        </div>
      </header>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DailyDigest />
        <TasksTodayCard />
        <InboxCard />
        <ProjectsActiveCard />
        <RecentNotesCard />
      </div>
      <HabitsTodayCard />
    </div>
  );
}
