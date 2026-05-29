import type { TerrainAvailable } from "../../types/training.ts";
import {
  getWeeklyIntensityCaps,
  type PlanWorkoutSubtype,
  type WorkoutLibraryRole,
  type WorkoutLibraryStress,
  type WorkoutLibraryVariables,
} from "./workoutLibrary.ts";

export type PlanIntensityBucket =
  | "easy"
  | "moderate"
  | "threshold"
  | "vo2"
  | "repetition";

export type IntensityWorkoutInput = {
  subtype: PlanWorkoutSubtype;
  role: WorkoutLibraryRole;
  stress: WorkoutLibraryStress;
  distanceKm: number | null;
  durationMin: number | null;
  targetPaceMaxSecPerKm: number | null;
  terrain: TerrainAvailable | null;
  variables: WorkoutLibraryVariables;
};

export type WeeklyIntensitySummary = {
  weekNumber: number;
  volumeKm: number;
  totalRunKm: number;
  easyKm: number;
  moderateKm: number;
  thresholdKm: number;
  vo2Km: number;
  repetitionKm: number;
  hardKm: number;
  hillLoadKm: number;
  easyShare: number;
  moderateShare: number;
  hardShare: number;
  thresholdCapKm: number;
  vo2CapKm: number;
  repetitionCapKm: number;
  loadRiskFlags: string[];
};

export type PlanIntensitySummary = Omit<
  WeeklyIntensitySummary,
  "weekNumber" | "volumeKm" | "thresholdCapKm" | "vo2CapKm" | "repetitionCapKm"
> & {
  weekCount: number;
};

export function getIntensityBucketForSubtype(
  subtype: PlanWorkoutSubtype,
): PlanIntensityBucket {
  if (
    subtype === "cruise_intervals" ||
    subtype === "continuous_tempo" ||
    subtype === "broken_tempo"
  ) {
    return "threshold";
  }

  if (subtype === "vo2_intervals" || subtype === "hill_repeats") {
    return "vo2";
  }

  if (
    subtype === "easy_strides" ||
    subtype === "hill_strides" ||
    subtype === "fartlek"
  ) {
    return "repetition";
  }

  if (
    subtype === "steady_aerobic" ||
    subtype === "medium_long_steady" ||
    subtype === "long_steady_finish" ||
    subtype === "long_mp_blocks" ||
    subtype === "mp_steady" ||
    subtype === "hm_pace_blocks" ||
    subtype === "race_day"
  ) {
    return "moderate";
  }

  return "easy";
}

export function summarizeWeeklyIntensity(input: {
  weekNumber: number;
  volumeKm: number;
  workouts: IntensityWorkoutInput[];
}): WeeklyIntensitySummary {
  const caps = getWeeklyIntensityCaps({ weeklyVolumeKm: input.volumeKm });
  let totalRunKm = 0;
  let easyKm = 0;
  let moderateKm = 0;
  let thresholdKm = 0;
  let vo2Km = 0;
  let repetitionKm = 0;
  let hillLoadKm = 0;

  for (const workout of input.workouts) {
    if (workout.distanceKm === null || workout.distanceKm <= 0) {
      continue;
    }

    const distanceKm = workout.distanceKm;
    const workKm = getIntensityWorkKm(workout);
    const bucket = getIntensityBucketForSubtype(workout.subtype);
    const contributionKm = bucket === "easy" ? 0 : Math.min(distanceKm, workKm);

    totalRunKm += distanceKm;

    if (bucket === "moderate") {
      moderateKm += contributionKm;
    } else if (bucket === "threshold") {
      thresholdKm += contributionKm;
    } else if (bucket === "vo2") {
      vo2Km += contributionKm;
    } else if (bucket === "repetition") {
      repetitionKm += contributionKm;
    }

    easyKm += Math.max(0, distanceKm - contributionKm);
    hillLoadKm += getHillLoadKm(workout, contributionKm);
  }

  const hardKm = thresholdKm + vo2Km + repetitionKm;
  const loadRiskFlags = getCapRiskFlags({
    thresholdKm,
    vo2Km,
    repetitionKm,
    thresholdCapKm: caps.thresholdCapKm,
    vo2CapKm: caps.vo2CapKm,
    repetitionCapKm: caps.repetitionCapKm,
  });

  return roundWeeklySummary({
    weekNumber: input.weekNumber,
    volumeKm: input.volumeKm,
    totalRunKm,
    easyKm,
    moderateKm,
    thresholdKm,
    vo2Km,
    repetitionKm,
    hardKm,
    hillLoadKm,
    easyShare: getShare(easyKm, totalRunKm),
    moderateShare: getShare(moderateKm, totalRunKm),
    hardShare: getShare(hardKm, totalRunKm),
    thresholdCapKm: caps.thresholdCapKm,
    vo2CapKm: caps.vo2CapKm,
    repetitionCapKm: caps.repetitionCapKm,
    loadRiskFlags,
  });
}

export function summarizePlanIntensity(
  weeklySummaries: WeeklyIntensitySummary[],
): PlanIntensitySummary {
  const totalRunKm = weeklySummaries.reduce(
    (total, week) => total + week.totalRunKm,
    0,
  );
  const easyKm = weeklySummaries.reduce((total, week) => total + week.easyKm, 0);
  const moderateKm = weeklySummaries.reduce(
    (total, week) => total + week.moderateKm,
    0,
  );
  const thresholdKm = weeklySummaries.reduce(
    (total, week) => total + week.thresholdKm,
    0,
  );
  const vo2Km = weeklySummaries.reduce((total, week) => total + week.vo2Km, 0);
  const repetitionKm = weeklySummaries.reduce(
    (total, week) => total + week.repetitionKm,
    0,
  );
  const hardKm = thresholdKm + vo2Km + repetitionKm;
  const hillLoadKm = weeklySummaries.reduce(
    (total, week) => total + week.hillLoadKm,
    0,
  );
  const loadRiskFlags = [
    ...new Set(weeklySummaries.flatMap((week) => week.loadRiskFlags)),
  ];

  return {
    weekCount: weeklySummaries.length,
    totalRunKm: roundDistance(totalRunKm),
    easyKm: roundDistance(easyKm),
    moderateKm: roundDistance(moderateKm),
    thresholdKm: roundDistance(thresholdKm),
    vo2Km: roundDistance(vo2Km),
    repetitionKm: roundDistance(repetitionKm),
    hardKm: roundDistance(hardKm),
    hillLoadKm: roundDistance(hillLoadKm),
    easyShare: getShare(easyKm, totalRunKm),
    moderateShare: getShare(moderateKm, totalRunKm),
    hardShare: getShare(hardKm, totalRunKm),
    loadRiskFlags,
  };
}

function getIntensityWorkKm(workout: IntensityWorkoutInput): number {
  if (
    workout.distanceKm === null ||
    workout.distanceKm <= 0 ||
    workout.variables.workDurationMin <= 0
  ) {
    return 0;
  }

  if (
    workout.targetPaceMaxSecPerKm !== null &&
    workout.targetPaceMaxSecPerKm > 0
  ) {
    return roundDistance(
      Math.min(
        workout.distanceKm,
        (workout.variables.workDurationMin * 60) / workout.targetPaceMaxSecPerKm,
      ),
    );
  }

  if (workout.durationMin !== null && workout.durationMin > 0) {
    return roundDistance(
      Math.min(
        workout.distanceKm,
        workout.distanceKm * (workout.variables.workDurationMin / workout.durationMin),
      ),
    );
  }

  return 0;
}

function getHillLoadKm(
  workout: IntensityWorkoutInput,
  intensityContributionKm: number,
): number {
  if (workout.subtype === "hill_repeats" || workout.subtype === "hill_strides") {
    return intensityContributionKm;
  }

  if (workout.terrain !== "hills" || workout.distanceKm === null) {
    return 0;
  }

  if (
    workout.role === "long_easy" ||
    workout.role === "long_steady" ||
    workout.role === "long_race_specific"
  ) {
    return workout.distanceKm * 0.3;
  }

  if (workout.stress === "hard" || workout.stress === "moderate") {
    return Math.max(intensityContributionKm, workout.distanceKm * 0.25);
  }

  return workout.distanceKm * 0.15;
}

function getCapRiskFlags(input: {
  thresholdKm: number;
  vo2Km: number;
  repetitionKm: number;
  thresholdCapKm: number;
  vo2CapKm: number;
  repetitionCapKm: number;
}): string[] {
  const flags: string[] = [];
  const toleranceKm = 0.15;

  if (input.thresholdKm > input.thresholdCapKm + toleranceKm) {
    flags.push("threshold_cap_exceeded");
  }

  if (input.vo2Km > input.vo2CapKm + toleranceKm) {
    flags.push("vo2_cap_exceeded");
  }

  if (input.repetitionKm > input.repetitionCapKm + toleranceKm) {
    flags.push("repetition_cap_exceeded");
  }

  return flags;
}

function roundWeeklySummary(
  summary: WeeklyIntensitySummary,
): WeeklyIntensitySummary {
  return {
    ...summary,
    volumeKm: roundDistance(summary.volumeKm),
    totalRunKm: roundDistance(summary.totalRunKm),
    easyKm: roundDistance(summary.easyKm),
    moderateKm: roundDistance(summary.moderateKm),
    thresholdKm: roundDistance(summary.thresholdKm),
    vo2Km: roundDistance(summary.vo2Km),
    repetitionKm: roundDistance(summary.repetitionKm),
    hardKm: roundDistance(summary.hardKm),
    hillLoadKm: roundDistance(summary.hillLoadKm),
  };
}

function getShare(partKm: number, totalKm: number): number {
  if (totalKm <= 0) {
    return 0;
  }

  return Math.round((partKm / totalKm) * 1000) / 1000;
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 10) / 10;
}
