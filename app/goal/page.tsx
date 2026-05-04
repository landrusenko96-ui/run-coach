import { RaceGoalForm } from "@/app/goal/RaceGoalForm";
import { PageHeader } from "@/components/PageHeader";

export default function GoalPage() {
  return (
    <>
      <PageHeader
        title="Goal"
        description="Save the active race goal that future training plans will be built around."
      />
      <RaceGoalForm />
    </>
  );
}
