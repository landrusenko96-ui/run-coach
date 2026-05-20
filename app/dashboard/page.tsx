import { PageHeader } from "@/components/PageHeader";
import { DashboardPanel } from "@/app/dashboard/DashboardPanel";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A weekly command center for today's workout, the next workout, plan changes, and export health."
      />
      <DashboardPanel />
    </>
  );
}
