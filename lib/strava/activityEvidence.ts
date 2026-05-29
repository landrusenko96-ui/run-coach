import {
  fetchStravaActivityDetailById,
  fetchStravaActivityStreams,
  type StravaActivityLap,
  type StravaActivityStreams,
  type StravaDetailedActivity,
  type StravaSummaryActivity,
} from "./client.ts";
import {
  getStravaActivityDate,
  isSupportedStravaRun,
  isValidStravaRunActivity,
} from "./importRuns.ts";

export type StravaActivityEffortHint =
  | "race_time_trial"
  | "easy_non_limit"
  | "controlled"
  | "hard_workout"
  | "possible_near_max";

export type StravaActivityEvidence = {
  stravaActivityId: string;
  hasDetail: boolean;
  hasStreams: boolean;
  hasHeartRateStream: boolean;
  hasPowerStream: boolean;
  achievementCount: number | null;
  bestEffortCount: number;
  prCount: number;
  perceivedExertion: number | null;
  workoutType: number | null;
  paceFadePercent: number | null;
  negativeSplit: boolean | null;
  splitPaceVariationPercent: number | null;
  sustainedHardSectionCount: number;
  elevationGainM: number | null;
  altitudeRangeM: number | null;
  gradeRangePercent: number | null;
  effortSignals: string[];
  classificationHint: StravaActivityEffortHint | null;
};

export type EnrichedStravaActivity = StravaSummaryActivity & {
  rawSummary: {
    summary: Record<string, unknown>;
    detail: Record<string, unknown> | null;
    streams: Record<string, unknown> | null;
    evidence: StravaActivityEvidence;
  };
};

export type EnrichStravaActivitiesForPlanHistoryResult = {
  activities: StravaSummaryActivity[];
  evidence: StravaActivityEvidence[];
  warnings: string[];
};

type FetchActivityDetail = typeof fetchStravaActivityDetailById;
type FetchActivityStreams = typeof fetchStravaActivityStreams;

const defaultStreamKeys = [
  "time",
  "distance",
  "heartrate",
  "watts",
  "velocity_smooth",
  "altitude",
  "grade_smooth",
  "cadence",
  "moving",
] as const;

export async function enrichStravaActivitiesForPlanHistory(input: {
  activities: StravaSummaryActivity[];
  accessToken: string;
  windowStartDate: string;
  windowEndDate: string;
  fetchActivityDetail?: FetchActivityDetail;
  fetchActivityStreams?: FetchActivityStreams;
}): Promise<EnrichStravaActivitiesForPlanHistoryResult> {
  const fetchActivityDetail =
    input.fetchActivityDetail ?? fetchStravaActivityDetailById;
  const fetchActivityStreams =
    input.fetchActivityStreams ?? fetchStravaActivityStreams;
  const enrichedActivities: StravaSummaryActivity[] = [];
  const evidenceItems: StravaActivityEvidence[] = [];
  const warnings: string[] = [];

  for (const activity of input.activities) {
    if (
      !shouldFetchStravaEvidence({
        activity,
        windowStartDate: input.windowStartDate,
        windowEndDate: input.windowEndDate,
      })
    ) {
      enrichedActivities.push(activity);
      continue;
    }

    let detail: StravaDetailedActivity | null = null;
    let streams: StravaActivityStreams | null = null;

    try {
      detail = await fetchActivityDetail({
        accessToken: input.accessToken,
        activityId: activity.id,
        includeAllEfforts: true,
      });
    } catch {
      warnings.push(
        `Could not fetch Strava detail for activity ${activity.id}; generation used summary-only evidence for that run.`,
      );
    }

    try {
      streams = await fetchActivityStreams({
        accessToken: input.accessToken,
        activityId: activity.id,
        keys: [...defaultStreamKeys],
      });
    } catch {
      warnings.push(
        `Could not fetch Strava streams for activity ${activity.id}; generation used available summary/detail evidence for that run.`,
      );
    }

    const evidence = buildStravaActivityEvidence({
      summary: activity,
      detail,
      streams,
    });

    evidenceItems.push(evidence);
    enrichedActivities.push(
      buildEnrichedStravaActivity({
        summary: activity,
        detail,
        streams,
        evidence,
      }),
    );
  }

  return {
    activities: enrichedActivities,
    evidence: evidenceItems,
    warnings: dedupeStrings(warnings),
  };
}

export function buildStravaActivityEvidence(input: {
  summary: StravaSummaryActivity;
  detail?: StravaDetailedActivity | null;
  streams?: StravaActivityStreams | null;
}): StravaActivityEvidence {
  const detail = input.detail ?? null;
  const streams = input.streams ?? null;
  const segmentPaces = getSegmentPaces(detail);
  const averagePaceSecPerKm = getAveragePaceSecPerKm(input.summary, detail);
  const splitPaceVariationPercent =
    segmentPaces.length >= 2 ? getVariationPercent(segmentPaces) : null;
  const paceTrend = getPaceTrend({
    segmentPaces,
    detail,
    streams,
  });
  const sustainedHardSectionCount = getSustainedHardSectionCount({
    segmentPaces,
    averagePaceSecPerKm,
  });
  const prCount = detail?.bestEfforts.filter(
    (effort) => effort.prRank !== null && effort.prRank <= 3,
  ).length ?? 0;
  const achievementCount = detail?.achievementCount ?? null;
  const bestEffortCount = detail?.bestEfforts.length ?? 0;
  const perceivedExertion = detail?.perceivedExertion ?? null;
  const hasHeartRateStream = Boolean(streams?.heartrate?.length);
  const hasPowerStream = Boolean(
    streams?.watts?.length ||
      detail?.averageWatts ||
      detail?.weightedAverageWatts ||
      detail?.maxWatts,
  );
  const elevationGainM =
    detail?.totalElevationGainM ?? input.summary.totalElevationGainM;
  const altitudeRangeM = getRange(streams?.altitude ?? null);
  const gradeRangePercent = getRange(streams?.gradeSmooth ?? null);
  const effortSignals = buildEffortSignals({
    summary: input.summary,
    detail,
    streams,
    perceivedExertion,
    achievementCount,
    prCount,
    bestEffortCount,
    splitPaceVariationPercent,
    sustainedHardSectionCount,
    paceFadePercent: paceTrend.paceFadePercent,
    negativeSplit: paceTrend.negativeSplit,
    hasHeartRateStream,
    hasPowerStream,
  });

  return {
    stravaActivityId: input.summary.id,
    hasDetail: detail !== null,
    hasStreams: streams !== null,
    hasHeartRateStream,
    hasPowerStream,
    achievementCount,
    bestEffortCount,
    prCount,
    perceivedExertion,
    workoutType: detail?.workoutType ?? null,
    paceFadePercent: paceTrend.paceFadePercent,
    negativeSplit: paceTrend.negativeSplit,
    splitPaceVariationPercent,
    sustainedHardSectionCount,
    elevationGainM,
    altitudeRangeM,
    gradeRangePercent,
    effortSignals,
    classificationHint: getClassificationHint({
      summary: input.summary,
      detail,
      perceivedExertion,
      achievementCount,
      prCount,
      bestEffortCount,
      splitPaceVariationPercent,
      sustainedHardSectionCount,
      paceFadePercent: paceTrend.paceFadePercent,
      negativeSplit: paceTrend.negativeSplit,
    }),
  };
}

export function isEnrichedStravaRawSummary(
  value: unknown,
): value is EnrichedStravaActivity["rawSummary"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (
    "summary" in value &&
    "evidence" in value
  );
}

function shouldFetchStravaEvidence(input: {
  activity: StravaSummaryActivity;
  windowStartDate: string;
  windowEndDate: string;
}): boolean {
  const activityDate = getStravaActivityDate(input.activity);

  return (
    isSupportedStravaRun(input.activity) &&
    isValidStravaRunActivity(input.activity) &&
    activityDate >= input.windowStartDate &&
    activityDate <= input.windowEndDate
  );
}

function buildEnrichedStravaActivity(input: {
  summary: StravaSummaryActivity;
  detail: StravaDetailedActivity | null;
  streams: StravaActivityStreams | null;
  evidence: StravaActivityEvidence;
}): EnrichedStravaActivity {
  return {
    ...input.summary,
    distanceM: input.detail?.distanceM ?? input.summary.distanceM,
    movingTimeSec: input.detail?.movingTimeSec ?? input.summary.movingTimeSec,
    elapsedTimeSec: input.detail?.elapsedTimeSec ?? input.summary.elapsedTimeSec,
    totalElevationGainM:
      input.detail?.totalElevationGainM ?? input.summary.totalElevationGainM,
    averageHeartRate:
      input.detail?.averageHeartRate ?? input.summary.averageHeartRate,
    maxHeartRate: input.detail?.maxHeartRate ?? input.summary.maxHeartRate,
    rawSummary: {
      summary: input.summary.rawSummary,
      detail: input.detail?.rawDetail ?? null,
      streams: input.streams?.rawStreams ?? null,
      evidence: input.evidence,
    },
  };
}

function getSegmentPaces(
  detail: StravaDetailedActivity | null,
): number[] {
  if (!detail) {
    return [];
  }

  const splitPaces = detail.splitsMetric
    .map((split) => split.paceSecPerKm)
    .filter(isPositiveNumber);

  if (splitPaces.length >= 2) {
    return splitPaces;
  }

  return detail.laps
    .map((lap) => lap.paceSecPerKm)
    .filter(isPositiveNumber);
}

function getAveragePaceSecPerKm(
  summary: StravaSummaryActivity,
  detail: StravaDetailedActivity | null,
): number | null {
  if (detail?.averageSpeedMps && detail.averageSpeedMps > 0) {
    return Math.round(1000 / detail.averageSpeedMps);
  }

  const distanceM = detail?.distanceM ?? summary.distanceM;
  const movingTimeSec = detail?.movingTimeSec ?? summary.movingTimeSec;

  if (!distanceM || distanceM <= 0 || !movingTimeSec || movingTimeSec <= 0) {
    return null;
  }

  return Math.round(movingTimeSec / (distanceM / 1000));
}

function getPaceTrend(input: {
  segmentPaces: number[];
  detail: StravaDetailedActivity | null;
  streams: StravaActivityStreams | null;
}): { paceFadePercent: number | null; negativeSplit: boolean | null } {
  const streamTrend = getStreamPaceTrend(input.streams);

  if (streamTrend.paceFadePercent !== null) {
    return streamTrend;
  }

  const splitTrend = getSegmentPaceTrend(input.segmentPaces);

  if (splitTrend.paceFadePercent !== null) {
    return splitTrend;
  }

  const lapTrend = getLapPaceTrend(input.detail?.laps ?? []);

  if (lapTrend.paceFadePercent !== null) {
    return lapTrend;
  }

  return {
    paceFadePercent: null,
    negativeSplit: null,
  };
}

function getStreamPaceTrend(
  streams: StravaActivityStreams | null,
): { paceFadePercent: number | null; negativeSplit: boolean | null } {
  if (!streams?.time || !streams.distance || streams.time.length < 4) {
    return {
      paceFadePercent: null,
      negativeSplit: null,
    };
  }

  const lastIndex = Math.min(streams.time.length, streams.distance.length) - 1;
  const firstDistance = streams.distance[0];
  const lastDistance = streams.distance[lastIndex];
  const totalDistance = lastDistance - firstDistance;

  if (totalDistance <= 1000) {
    return {
      paceFadePercent: null,
      negativeSplit: null,
    };
  }

  const halfwayDistance = firstDistance + totalDistance / 2;
  const midpointIndex = streams.distance.findIndex(
    (distance) => distance >= halfwayDistance,
  );

  if (midpointIndex <= 0 || midpointIndex >= lastIndex) {
    return {
      paceFadePercent: null,
      negativeSplit: null,
    };
  }

  const firstHalfPace = getPaceFromDistanceAndTime({
    distanceM: streams.distance[midpointIndex] - firstDistance,
    durationSec: streams.time[midpointIndex] - streams.time[0],
  });
  const secondHalfPace = getPaceFromDistanceAndTime({
    distanceM: lastDistance - streams.distance[midpointIndex],
    durationSec: streams.time[lastIndex] - streams.time[midpointIndex],
  });

  return getPaceFade(firstHalfPace, secondHalfPace);
}

function getSegmentPaceTrend(
  segmentPaces: number[],
): { paceFadePercent: number | null; negativeSplit: boolean | null } {
  if (segmentPaces.length < 2) {
    return {
      paceFadePercent: null,
      negativeSplit: null,
    };
  }

  const midpoint = Math.floor(segmentPaces.length / 2);
  const firstHalfPace = mean(segmentPaces.slice(0, midpoint));
  const secondHalfPace = mean(segmentPaces.slice(midpoint));

  return getPaceFade(firstHalfPace, secondHalfPace);
}

function getLapPaceTrend(
  laps: StravaActivityLap[],
): { paceFadePercent: number | null; negativeSplit: boolean | null } {
  const lapPaces = laps
    .map((lap) => lap.paceSecPerKm)
    .filter(isPositiveNumber);

  return getSegmentPaceTrend(lapPaces);
}

function getPaceFade(
  firstHalfPace: number | null,
  secondHalfPace: number | null,
): { paceFadePercent: number | null; negativeSplit: boolean | null } {
  if (
    firstHalfPace === null ||
    secondHalfPace === null ||
    firstHalfPace <= 0 ||
    secondHalfPace <= 0
  ) {
    return {
      paceFadePercent: null,
      negativeSplit: null,
    };
  }

  const paceFadePercent = roundToTenth(
    ((secondHalfPace - firstHalfPace) / firstHalfPace) * 100,
  );

  return {
    paceFadePercent,
    negativeSplit: secondHalfPace <= firstHalfPace * 0.98,
  };
}

function getSustainedHardSectionCount(input: {
  segmentPaces: number[];
  averagePaceSecPerKm: number | null;
}): number {
  const averagePaceSecPerKm = input.averagePaceSecPerKm;

  if (!averagePaceSecPerKm || input.segmentPaces.length === 0) {
    return 0;
  }

  return input.segmentPaces.filter(
    (pace) => pace <= averagePaceSecPerKm * 0.92,
  ).length;
}

function buildEffortSignals(input: {
  summary: StravaSummaryActivity;
  detail: StravaDetailedActivity | null;
  streams: StravaActivityStreams | null;
  perceivedExertion: number | null;
  achievementCount: number | null;
  prCount: number;
  bestEffortCount: number;
  splitPaceVariationPercent: number | null;
  sustainedHardSectionCount: number;
  paceFadePercent: number | null;
  negativeSplit: boolean | null;
  hasHeartRateStream: boolean;
  hasPowerStream: boolean;
}): string[] {
  const signals: string[] = [];

  if (input.detail) {
    signals.push("Strava activity detail available");
  }

  if (input.streams) {
    signals.push("Strava activity streams available");
  }

  if (input.perceivedExertion !== null) {
    signals.push(`Strava perceived exertion ${input.perceivedExertion}`);
  }

  if (input.achievementCount !== null && input.achievementCount > 0) {
    signals.push(`${input.achievementCount} Strava achievement signal`);
  }

  if (input.prCount > 0) {
    signals.push(`${input.prCount} Strava PR/best-effort signal`);
  } else if (input.bestEffortCount > 0) {
    signals.push(`${input.bestEffortCount} Strava best-effort signal`);
  }

  if (input.splitPaceVariationPercent !== null) {
    signals.push(
      `split/lap pace variation ${input.splitPaceVariationPercent}%`,
    );
  }

  if (input.sustainedHardSectionCount > 0) {
    signals.push(`${input.sustainedHardSectionCount} sustained fast section signal`);
  }

  if (input.paceFadePercent !== null) {
    signals.push(`pace fade ${input.paceFadePercent}%`);
  }

  if (input.negativeSplit) {
    signals.push("negative split signal");
  }

  if (input.hasHeartRateStream) {
    signals.push("heart-rate stream available");
  }

  if (input.hasPowerStream) {
    signals.push("run power evidence available");
  }

  if (hasNearMaxNameSignal(input.summary.name)) {
    signals.push("race/time-trial name signal");
  } else if (hasWorkoutNameSignal(input.summary.name)) {
    signals.push("workout name signal");
  }

  if (input.detail?.workoutType !== null && input.detail?.workoutType !== undefined) {
    signals.push(`Strava workout_type ${input.detail.workoutType}`);
  }

  return dedupeStrings(signals);
}

function getClassificationHint(input: {
  summary: StravaSummaryActivity;
  detail: StravaDetailedActivity | null;
  perceivedExertion: number | null;
  achievementCount: number | null;
  prCount: number;
  bestEffortCount: number;
  splitPaceVariationPercent: number | null;
  sustainedHardSectionCount: number;
  paceFadePercent: number | null;
  negativeSplit: boolean | null;
}): StravaActivityEffortHint | null {
  const nearMaxNameSignal = hasNearMaxNameSignal(input.summary.name);
  const workoutNameSignal = hasWorkoutNameSignal(input.summary.name);
  const workoutType = input.detail?.workoutType ?? null;
  const hasAchievementSignal =
    input.prCount > 0 ||
    input.bestEffortCount > 0 ||
    (input.achievementCount !== null && input.achievementCount > 0);
  const hasHardShapeSignal =
    input.sustainedHardSectionCount >= 2 ||
    (input.splitPaceVariationPercent !== null &&
      input.splitPaceVariationPercent >= 8);
  const hasStrongNearMaxEffort =
    (input.perceivedExertion !== null && input.perceivedExertion >= 9) ||
    (hasAchievementSignal &&
      (hasHardShapeSignal ||
        (input.perceivedExertion !== null && input.perceivedExertion >= 8))) ||
    (workoutType === 1 &&
      (hasAchievementSignal ||
        hasHardShapeSignal ||
        (input.perceivedExertion !== null && input.perceivedExertion >= 8)));

  if (
    nearMaxNameSignal &&
    (hasStrongNearMaxEffort ||
      hasAchievementSignal ||
      (input.perceivedExertion !== null && input.perceivedExertion >= 8))
  ) {
    return "race_time_trial";
  }

  if (hasStrongNearMaxEffort) {
    return "possible_near_max";
  }

  if (nearMaxNameSignal) {
    return "hard_workout";
  }

  if (
    hasAchievementSignal &&
    (input.perceivedExertion !== null && input.perceivedExertion >= 7)
  ) {
    return "possible_near_max";
  }

  if (
    workoutNameSignal ||
    (input.perceivedExertion !== null && input.perceivedExertion >= 7) ||
    (workoutType !== null && workoutType > 1) ||
    input.sustainedHardSectionCount >= 2
  ) {
    return "hard_workout";
  }

  if (
    (input.perceivedExertion !== null && input.perceivedExertion >= 4) ||
    input.sustainedHardSectionCount === 1 ||
    (input.splitPaceVariationPercent !== null &&
      input.splitPaceVariationPercent >= 5) ||
    input.negativeSplit === true
  ) {
    return "controlled";
  }

  if (
    input.detail ||
    input.achievementCount !== null ||
    input.paceFadePercent !== null
  ) {
    return "easy_non_limit";
  }

  return null;
}

function hasNearMaxNameSignal(name: string): boolean {
  return /\b(race|time trial|tt|all out|max effort|near max|pr|pb)\b/i.test(name);
}

function hasWorkoutNameSignal(name: string): boolean {
  return /\b(tempo|threshold|interval|workout|fartlek|progression|hard)\b/i.test(name);
}

function getVariationPercent(values: number[]): number {
  const average = mean(values);

  if (average <= 0) {
    return 0;
  }

  const variance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
    values.length;

  return roundToTenth((Math.sqrt(variance) / average) * 100);
}

function getRange(values: number[] | null): number | null {
  if (!values || values.length === 0) {
    return null;
  }

  return roundToTenth(Math.max(...values) - Math.min(...values));
}

function getPaceFromDistanceAndTime(input: {
  distanceM: number;
  durationSec: number;
}): number | null {
  if (input.distanceM <= 0 || input.durationSec <= 0) {
    return null;
  }

  return input.durationSec / (input.distanceM / 1000);
}

function isPositiveNumber(value: number | null): value is number {
  return value !== null && value > 0 && Number.isFinite(value);
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
