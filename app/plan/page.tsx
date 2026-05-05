import { PageHeader } from "@/components/PageHeader";
import { TrainingPlanPanel } from "@/app/plan/TrainingPlanPanel";

export default function PlanPage() {
  return (
    <>
      <PageHeader
        title="Plan"
        description="Manage saved training plans, choose one active plan, and review the active plan schedule."
      />
      <TrainingPlanPanel />
    </>
  );
}
