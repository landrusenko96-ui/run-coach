import { DirectGarminBridgeStatusPanel } from "@/app/settings/DirectGarminBridgeStatusPanel";
import { IntervalsSettingsPanel } from "@/app/settings/IntervalsSettingsPanel";
import { StravaSettingsPanel } from "@/app/settings/StravaSettingsPanel";
import { PageHeader } from "@/components/PageHeader";
import { getIntervalsServerConfigStatus } from "@/lib/intervals/config";

type SettingsPageSearchParams = Record<string, string | string[] | undefined>;

type SettingsPageProps = {
  searchParams?: SettingsPageSearchParams | Promise<SettingsPageSearchParams>;
};

function getStravaRedirectMessage(
  value: string | string[] | undefined,
): string | null {
  const status = Array.isArray(value) ? value[0] : value;

  if (status === "config_error") {
    return "Strava is not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, NEXT_PUBLIC_APP_URL, and SUPABASE_SERVICE_ROLE_KEY in the server environment.";
  }

  return null;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const intervalsEnvStatus = getIntervalsServerConfigStatus();
  const stravaRedirectMessage = getStravaRedirectMessage(
    resolvedSearchParams?.strava,
  );

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage simple app preferences and early integration settings."
      />
      <div className="space-y-6">
        {stravaRedirectMessage ? (
          <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {stravaRedirectMessage}
          </section>
        ) : null}
        <IntervalsSettingsPanel envStatus={intervalsEnvStatus} />
        <StravaSettingsPanel />
        <DirectGarminBridgeStatusPanel />

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
