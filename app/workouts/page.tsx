import { PageHeader } from "@/components/PageHeader";

export default function WorkoutsPage() {
  return (
    <>
      <PageHeader
        title="Workouts"
        description="This page will support manual workout logging before any Strava import is added."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">Workout log</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: completed runs, effort ratings, notes, and workout
          evaluations will be listed here later.
        </p>
      </div>
    </>
  );
}
