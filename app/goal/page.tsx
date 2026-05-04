import { PageHeader } from "@/components/PageHeader";

export default function GoalPage() {
  return (
    <>
      <PageHeader
        title="Goal"
        description="This page will capture the target race and the goal that the training plan should support."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">Race goal</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: race date, distance, target finish time, and priority
          level will be entered here later.
        </p>
      </div>
    </>
  );
}
