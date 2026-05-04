import { PageHeader } from "@/components/PageHeader";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="This will become the main overview of current training status, recent workouts, upcoming workouts, and important plan changes."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">Training overview</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: once the app has real data, this area can summarize the
          current week, fatigue signals, race countdown, and next workout.
        </p>
      </div>
    </>
  );
}
