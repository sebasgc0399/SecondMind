import Greeting from '@/components/dashboard/Greeting';
import QuickCaptureButton from '@/components/dashboard/QuickCaptureButton';
import ReviewCard from '@/components/dashboard/ReviewCard';
import TasksTodayCard from '@/components/dashboard/TasksTodayCard';
import InboxCard from '@/components/dashboard/InboxCard';
import HubsCard from '@/components/dashboard/HubsCard';
import ProjectsActiveCard from '@/components/dashboard/ProjectsActiveCard';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';
import HabitsTodayCard from '@/components/dashboard/HabitsTodayCard';

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
        <ReviewCard />
        <TasksTodayCard />
        <InboxCard />
        <HubsCard />
        <ProjectsActiveCard />
        <RecentNotesCard />
      </div>
      <HabitsTodayCard />
    </div>
  );
}
