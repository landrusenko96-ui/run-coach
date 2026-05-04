import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="This page will contain simple app preferences and account settings once authentication exists."
      />
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium">App settings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Placeholder: notification preferences, units, privacy settings, and
          future account controls can live here.
        </p>
      </div>
    </>
  );
}
