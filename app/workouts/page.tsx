import { PageHeader } from "@/components/PageHeader";
import { WorkoutLoggingPanel } from "@/app/workouts/WorkoutLoggingPanel";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeader
        title="Workouts"
        description="Log completed runs manually or import recent Strava runs."
      />
      <WorkoutLoggingPanel />
    </>
  );
}
