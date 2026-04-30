import Greeting from '@/components/dashboard/Greeting';
import QuickCaptureButton from '@/components/capture/QuickCaptureButton';
import ReviewCard from '@/components/dashboard/ReviewCard';
import TasksTodayCard from '@/components/dashboard/TasksTodayCard';
import InboxCard from '@/components/dashboard/InboxCard';
import HubsCard from '@/components/dashboard/HubsCard';
import ProjectsActiveCard from '@/components/dashboard/ProjectsActiveCard';
import RecentNotesCard from '@/components/dashboard/RecentNotesCard';
import HabitsTodayCard from '@/components/dashboard/HabitsTodayCard';
import usePreferences from '@/hooks/usePreferences';

export default function DashboardPage() {
  const { preferences } = usePreferences();
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 md:mb-8">
        <Greeting />
        {!preferences.sidebarHidden && (
          <div className="hidden md:block">
            <QuickCaptureButton />
          </div>
        )}
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
