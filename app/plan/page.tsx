import { PageHeader } from "@/components/PageHeader";
import { TrainingPlanPanel } from "@/app/plan/TrainingPlanPanel";

export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="Plan"
        description="This page will show the generated training plan and any conservative adjustments made over time."
      />
      <TrainingPlanPanel />
    </>
  );
}
