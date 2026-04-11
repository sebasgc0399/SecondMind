import Greeting from '@/components/dashboard/Greeting';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import InboxCard from '@/components/dashboard/InboxCard';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';
import TasksTodayCard from '@/components/dashboard/TasksTodayCard';
import ProjectsActiveCard from '@/components/dashboard/ProjectsActiveCard';
import HabitsTodayCard from '@/components/dashboard/HabitsTodayCard';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Greeting />
        <QuickCaptureButton />
      </header>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <TasksTodayCard />
        <InboxCard />
        <ProjectsActiveCard />
        <RecentNotesCard />
      </div>
      <HabitsTodayCard />
    </div>
  );
}
