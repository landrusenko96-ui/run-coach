import { PageHeader } from "@/components/PageHeader";
import { DashboardPanel } from "@/app/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A simple overview of the active training plan, recent logs, and workout scores."
      />
      <DashboardPanel />
    </>
  );
}
