import { IntervalsSettingsPanel } from "@/app/settings/IntervalsSettingsPanel";
import { PageHeader } from "@/components/PageHeader";
import { getIntervalsServerConfigStatus } from "@/lib/intervals/config";

export default function SettingsPage() {
  const intervalsEnvStatus = getIntervalsServerConfigStatus();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage simple app preferences and early integration settings."
      />
      <div className="space-y-6">
        <IntervalsSettingsPanel envStatus={intervalsEnvStatus} />

        <section className="rounded-md border border-slate-200 bg-white p-6">
          <h2 className="text-base font-medium">App settings</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Placeholder: notification preferences, units, privacy settings, and
            future account controls can live here.
          </p>
        </section>
      </div>
    </>
  );
}
