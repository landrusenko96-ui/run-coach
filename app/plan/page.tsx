import { PageHeader } from "@/components/PageHeader";

export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="Plan"
        description="This page will show the generated training plan and any conservative adjustments made over time."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">Training plan</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: planned workouts, weekly structure, recovery days, and
          adjustment reasons will eventually appear here.
        </p>
      </div>
    </>
  );
}
