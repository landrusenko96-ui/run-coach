import type { StravaImportResponse } from "@/types";

type StravaImportSummaryProps = {
  summary: StravaImportResponse | null;
};

function formatPlanAdjustmentValue(adjusted: number): string {
  return adjusted > 0 ? `Yes (${adjusted})` : "No";
}

function formatWorkoutDate(dateText: string): string {
  const [yearText, monthText, dayText] = dateText.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return dateText;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatDistance(distanceKm: number | null): string {
  if (!distanceKm || distanceKm <= 0) {
    return "No distance";
  }

  return `${distanceKm.toFixed(1)} km`;
}

function formatPace(avgPaceSecPerKm: number | null): string {
  if (!avgPaceSecPerKm || avgPaceSecPerKm <= 0) {
    return "No pace";
  }

  const minutes = Math.floor(avgPaceSecPerKm / 60);
  const seconds = avgPaceSecPerKm % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

export function StravaImportSummary({ summary }: StravaImportSummaryProps) {
  if (!summary) {
    return null;
  }

  const activityResults = summary.activityResults ?? [];

  const items = [
    ["Imported", summary.imported],
    ["Duplicates skipped", summary.skippedDuplicates],
    ["Already logged skipped", summary.skippedAlreadyLogged],
    ["Before plan skipped", summary.skippedBeforePlanStart],
    ["After plan skipped", summary.skippedAfterPlanEnd],
    ["Non-runs skipped", summary.skippedNonRuns],
    ["Invalid skipped", summary.skippedInvalid],
    ["Linked to planned workouts", summary.linkedToPlanned],
    ["Imported unlinked", summary.importedUnlinked],
    ["Scored", summary.scored],
    ["Plan adjustment ran", formatPlanAdjustmentValue(summary.adjusted)],
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-medium text-slate-950">
        Latest Strava import
      </h3>
      <p className="mt-1 text-sm text-slate-600">{summary.message}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div
            className="rounded-md border border-slate-200 bg-white px-3 py-2"
            key={label}
          >
            <dt className="text-xs font-medium uppercase tracking-normal text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 font-medium text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>

      {activityResults.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-950">
            Workouts pulled from Strava
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
            {activityResults.map((workout, index) => (
              <li key={`${workout.stravaActivityId}-${workout.status}-${index}`}>
                {workout.name} - {formatWorkoutDate(workout.date)} -{" "}
                {formatDistance(workout.distanceKm)} -{" "}
                {formatPace(workout.avgPaceSecPerKm)} - {workout.statusMessage}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {summary.errors.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            Import warnings
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
            {summary.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
