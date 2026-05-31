import type {
  PhysiologyZoneSource,
  PlanGenerationPhaseLabel,
  RunnerProfile,
  UserHeartRateZone,
  UserPowerZone,
} from "../../types/training.ts";
import type { WorkoutLibraryRole } from "./workoutLibrary.ts";
import type { StravaActivityEvidence } from "../strava/activityEvidence.ts";

export type PhysiologyEffortLevel =
  | "easy"
  | "controlled"
  | "hard"
  | "near_max";

export type PhysiologyEffortClassification = {
  level: PhysiologyEffortLevel | null;
  evidence: string[];
  source:
    | "explicit_hr_zones"
    | "lactate_threshold_hr"
    | "aerobic_threshold_hr"
    | "hr_reserve"
    | "max_hr"
    | "power_zones"
    | "threshold_power"
    | null;
};

export type WorkoutTargetKind =
  | "recovery"
  | "easy"
  | "steady"
  | "threshold"
  | "interval"
  | "race_pace";

export type AdvancedWorkoutTargets = {
  heartRate: Record<WorkoutTargetKind, string | null>;
  power: Record<WorkoutTargetKind, string | null>;
  hasHeartRateTargets: boolean;
  hasPowerTargets: boolean;
  assumptions: string[];
};

type ValidHeartRateZone = UserHeartRateZone & {
  lower_bpm: number;
  upper_bpm: number;
};

type ValidPowerZone = UserPowerZone & {
  lower_watts: number;
  upper_watts: number;
};

const emptyTargetMap: Record<WorkoutTargetKind, string | null> = {
  recovery: null,
  easy: null,
  steady: null,
  threshold: null,
  interval: null,
  race_pace: null,
};

export function buildAdvancedWorkoutTargets(
  runnerProfile: RunnerProfile,
): AdvancedWorkoutTargets {
  const assumptions: string[] = [];
  const heartRate = buildHeartRateTargets(runnerProfile, assumptions);
  const power = buildPowerTargets(runnerProfile, assumptions);

  return {
    heartRate,
    power,
    hasHeartRateTargets: Object.values(heartRate).some(Boolean),
    hasPowerTargets: Object.values(power).some(Boolean),
    assumptions,
  };
}

export function getWorkoutTargetKind(input: {
  role: WorkoutLibraryRole;
  phase: PlanGenerationPhaseLabel;
}): WorkoutTargetKind {
  if (input.role === "recovery") {
    return "recovery";
  }

  if (
    input.role === "threshold" ||
    input.role === "long_steady" ||
    input.role === "steady"
  ) {
    return input.role === "threshold" ? "threshold" : "steady";
  }

  if (input.role === "interval") {
    return "interval";
  }

  if (
    input.role === "race_pace" ||
    input.role === "long_race_specific" ||
    input.role === "race_day"
  ) {
    return "race_pace";
  }

  if (input.role === "medium_long") {
    return input.phase === "specific" || input.phase === "peak"
      ? "steady"
      : "easy";
  }

  return "easy";
}

export function classifyEffortFromPhysiology(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  stravaEvidence: StravaActivityEvidence | null;
}): PhysiologyEffortClassification {
  const explicitHrZoneClassification = classifyFromExplicitHeartRateZones(input);

  if (explicitHrZoneClassification.level !== null) {
    return explicitHrZoneClassification;
  }

  const thresholdHrClassification = classifyFromThresholdHeartRate(input);

  if (thresholdHrClassification.level !== null) {
    return thresholdHrClassification;
  }

  const hrReserveClassification = classifyFromHeartRateReserve(input);

  if (hrReserveClassification.level !== null) {
    return hrReserveClassification;
  }

  const maxHrClassification = classifyFromMaxHeartRate(input);

  if (maxHrClassification.level !== null) {
    return maxHrClassification;
  }

  const aerobicThresholdHrClassification =
    classifyFromAerobicThresholdHeartRate(input);

  if (aerobicThresholdHrClassification.level !== null) {
    return aerobicThresholdHrClassification;
  }

  const powerZoneClassification = classifyFromPowerZones(input);

  if (powerZoneClassification.level !== null) {
    return powerZoneClassification;
  }

  return classifyFromThresholdPower(input);
}

export function getThresholdPowerWatts(
  runnerProfile: RunnerProfile,
): number | null {
  return (
    getReasonablePower(runnerProfile.threshold_power_watts) ??
    getReasonablePower(runnerProfile.critical_power_watts)
  );
}

function buildHeartRateTargets(
  runnerProfile: RunnerProfile,
  assumptions: string[],
): Record<WorkoutTargetKind, string | null> {
  const zones = getValidHeartRateZones(runnerProfile.user_hr_zones);

  if (zones.length >= 3) {
    assumptions.push(
      "Workout heart-rate guidance uses explicit saved HR zones before max-HR fallback.",
    );

    return {
      recovery: combineZoneLabels([zones[0], zones[1] ?? null]),
      easy: formatHeartRateZone(zones[1] ?? zones[0]),
      steady: formatHeartRateZone(zones[2] ?? zones[1] ?? zones[0]),
      threshold: formatHeartRateZone(
        zones[3] ?? zones[2] ?? zones[zones.length - 1],
      ),
      interval: formatHeartRateZone(zones[4] ?? zones[zones.length - 1]),
      race_pace: combineZoneLabels([
        zones[2] ?? zones[1] ?? zones[0],
        zones[3] ?? zones[2] ?? null,
      ]),
    };
  }

  if (isReasonableHeartRate(runnerProfile.lactate_threshold_heart_rate)) {
    const thresholdHr = runnerProfile.lactate_threshold_heart_rate;
    const aerobicThresholdHr = isReasonableHeartRate(
      runnerProfile.aerobic_threshold_heart_rate,
    )
      ? runnerProfile.aerobic_threshold_heart_rate
      : null;

    assumptions.push(
      "Workout heart-rate guidance uses saved lactate-threshold HR.",
    );

    return {
      recovery: aerobicThresholdHr
        ? bpmRange(aerobicThresholdHr * 0.82, aerobicThresholdHr * 0.92)
        : bpmRange(thresholdHr * 0.65, thresholdHr * 0.75),
      easy: aerobicThresholdHr
        ? bpmRange(aerobicThresholdHr * 0.92, aerobicThresholdHr)
        : bpmRange(thresholdHr * 0.75, thresholdHr * 0.85),
      steady: aerobicThresholdHr
        ? bpmRange(aerobicThresholdHr, thresholdHr * 0.92)
        : bpmRange(thresholdHr * 0.85, thresholdHr * 0.92),
      threshold: bpmRange(thresholdHr * 0.95, thresholdHr * 1.02),
      interval: bpmRange(thresholdHr * 1.02, thresholdHr * 1.06),
      race_pace: bpmRange(thresholdHr * 0.88, thresholdHr * 0.96),
    };
  }

  if (isReasonableHeartRate(runnerProfile.aerobic_threshold_heart_rate)) {
    const aerobicThresholdHr = runnerProfile.aerobic_threshold_heart_rate;

    assumptions.push(
      "Workout heart-rate guidance uses saved aerobic-threshold HR for easy and steady targets.",
    );

    return {
      recovery: bpmRange(aerobicThresholdHr * 0.82, aerobicThresholdHr * 0.92),
      easy: bpmRange(aerobicThresholdHr * 0.9, aerobicThresholdHr),
      steady: bpmRange(aerobicThresholdHr, aerobicThresholdHr * 1.08),
      threshold: null,
      interval: null,
      race_pace: bpmRange(aerobicThresholdHr * 1.02, aerobicThresholdHr * 1.1),
    };
  }

  if (
    isReasonableHeartRate(runnerProfile.resting_heart_rate) &&
    isReasonableHeartRate(runnerProfile.max_heart_rate) &&
    runnerProfile.max_heart_rate > runnerProfile.resting_heart_rate + 20
  ) {
    assumptions.push(
      "Workout heart-rate guidance uses HR reserve from saved resting and max heart rate.",
    );

    return {
      recovery: heartRateReserveRange(runnerProfile, 0.5, 0.65),
      easy: heartRateReserveRange(runnerProfile, 0.6, 0.75),
      steady: heartRateReserveRange(runnerProfile, 0.72, 0.82),
      threshold: heartRateReserveRange(runnerProfile, 0.82, 0.9),
      interval: heartRateReserveRange(runnerProfile, 0.9, 0.95),
      race_pace: heartRateReserveRange(runnerProfile, 0.76, 0.86),
    };
  }

  if (isReasonableHeartRate(runnerProfile.max_heart_rate)) {
    const maxHr = runnerProfile.max_heart_rate;

    assumptions.push(
      "Workout heart-rate guidance uses max-HR percentages because no stronger HR zone data is saved.",
    );

    return {
      recovery: bpmRange(maxHr * 0.6, maxHr * 0.7),
      easy: bpmRange(maxHr * 0.65, maxHr * 0.78),
      steady: bpmRange(maxHr * 0.75, maxHr * 0.84),
      threshold: bpmRange(maxHr * 0.84, maxHr * 0.9),
      interval: bpmRange(maxHr * 0.9, maxHr * 0.95),
      race_pace: bpmRange(maxHr * 0.78, maxHr * 0.88),
    };
  }

  return { ...emptyTargetMap };
}

function buildPowerTargets(
  runnerProfile: RunnerProfile,
  assumptions: string[],
): Record<WorkoutTargetKind, string | null> {
  const zones = getValidPowerZones(runnerProfile.user_power_zones);
  const easyPowerRange = getEasyPowerRange(runnerProfile);

  if (zones.length >= 3) {
    assumptions.push(
      "Workout power guidance uses explicit saved power zones as supporting targets.",
    );

    return {
      recovery: combinePowerZoneLabels([zones[0], zones[1] ?? null]),
      easy: formatPowerZone(zones[1] ?? zones[0]),
      steady: formatPowerZone(zones[2] ?? zones[1] ?? zones[0]),
      threshold: formatPowerZone(
        zones[3] ?? zones[2] ?? zones[zones.length - 1],
      ),
      interval: formatPowerZone(zones[4] ?? zones[zones.length - 1]),
      race_pace: combinePowerZoneLabels([
        zones[2] ?? zones[1] ?? zones[0],
        zones[3] ?? zones[2] ?? null,
      ]),
    };
  }

  const thresholdPower = getThresholdPowerWatts(runnerProfile);

  if (thresholdPower !== null) {
    assumptions.push(
      "Workout power guidance uses saved threshold or critical power as a supporting target.",
    );

    return {
      recovery: wattsRange(thresholdPower * 0.5, thresholdPower * 0.62),
      easy:
        easyPowerRange ?? wattsRange(thresholdPower * 0.62, thresholdPower * 0.75),
      steady: wattsRange(thresholdPower * 0.75, thresholdPower * 0.84),
      threshold: wattsRange(thresholdPower * 0.9, thresholdPower * 1.02),
      interval: wattsRange(thresholdPower * 1.05, thresholdPower * 1.15),
      race_pace: wattsRange(thresholdPower * 0.8, thresholdPower * 0.92),
    };
  }

  if (easyPowerRange !== null) {
    assumptions.push(
      "Easy workout power guidance uses the saved easy power range.",
    );

    return {
      ...emptyTargetMap,
      recovery: easyPowerRange,
      easy: easyPowerRange,
    };
  }

  return { ...emptyTargetMap };
}

function classifyFromExplicitHeartRateZones(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}): PhysiologyEffortClassification {
  const zones = getValidHeartRateZones(input.runnerProfile.user_hr_zones);

  if (zones.length < 3) {
    return emptyClassification("explicit_hr_zones");
  }

  const avgZoneIndex = input.avgHeartRate
    ? zones.findIndex(
        (zone) =>
          input.avgHeartRate !== null &&
          input.avgHeartRate >= zone.lower_bpm &&
          input.avgHeartRate <= zone.upper_bpm,
      )
    : -1;
  const maxZoneIndex = input.maxHeartRate
    ? zones.findIndex(
        (zone) =>
          input.maxHeartRate !== null &&
          input.maxHeartRate >= zone.lower_bpm &&
          input.maxHeartRate <= zone.upper_bpm,
      )
    : -1;
  const highestZoneIndex = Math.max(avgZoneIndex, maxZoneIndex);

  if (highestZoneIndex < 0) {
    return emptyClassification("explicit_hr_zones");
  }

  const zoneNumber = highestZoneIndex + 1;

  return {
    level:
      zoneNumber >= 5
        ? "near_max"
        : zoneNumber >= 4
          ? "hard"
          : zoneNumber >= 3
            ? "controlled"
            : "easy",
    evidence: [`personal HR zone ${zoneNumber}`],
    source: "explicit_hr_zones",
  };
}

function classifyFromThresholdHeartRate(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}): PhysiologyEffortClassification {
  const thresholdHr = input.runnerProfile.lactate_threshold_heart_rate;

  if (!isReasonableHeartRate(thresholdHr)) {
    return emptyClassification("lactate_threshold_hr");
  }

  const avgRatio = input.avgHeartRate ? input.avgHeartRate / thresholdHr : null;
  const maxRatio = input.maxHeartRate ? input.maxHeartRate / thresholdHr : null;
  const evidence = buildRatioEvidence("LT HR", avgRatio, maxRatio);

  if (
    (maxRatio !== null && maxRatio >= 1.07) ||
    (avgRatio !== null && avgRatio >= 1.03)
  ) {
    return { level: "near_max", evidence, source: "lactate_threshold_hr" };
  }

  if (
    (maxRatio !== null && maxRatio >= 1.02) ||
    (avgRatio !== null && avgRatio >= 0.96)
  ) {
    return { level: "hard", evidence, source: "lactate_threshold_hr" };
  }

  if (avgRatio !== null && avgRatio >= 0.88) {
    return { level: "controlled", evidence, source: "lactate_threshold_hr" };
  }

  if (avgRatio !== null || maxRatio !== null) {
    return { level: "easy", evidence, source: "lactate_threshold_hr" };
  }

  return emptyClassification("lactate_threshold_hr");
}

function classifyFromHeartRateReserve(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
}): PhysiologyEffortClassification {
  const restingHr = input.runnerProfile.resting_heart_rate;
  const maxHr = input.runnerProfile.max_heart_rate;

  if (
    !isReasonableHeartRate(restingHr) ||
    !isReasonableHeartRate(maxHr) ||
    maxHr <= restingHr + 20 ||
    input.avgHeartRate === null
  ) {
    return emptyClassification("hr_reserve");
  }

  const reserveRatio = (input.avgHeartRate - restingHr) / (maxHr - restingHr);
  const evidence = [`average HR ${Math.round(reserveRatio * 100)}% of HR reserve`];

  if (reserveRatio >= 0.9) {
    return { level: "near_max", evidence, source: "hr_reserve" };
  }

  if (reserveRatio >= 0.82) {
    return { level: "hard", evidence, source: "hr_reserve" };
  }

  if (reserveRatio >= 0.7) {
    return { level: "controlled", evidence, source: "hr_reserve" };
  }

  return { level: "easy", evidence, source: "hr_reserve" };
}

function classifyFromAerobicThresholdHeartRate(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}): PhysiologyEffortClassification {
  const aerobicThresholdHr = input.runnerProfile.aerobic_threshold_heart_rate;

  if (!isReasonableHeartRate(aerobicThresholdHr)) {
    return emptyClassification("aerobic_threshold_hr");
  }

  const avgRatio = input.avgHeartRate
    ? input.avgHeartRate / aerobicThresholdHr
    : null;
  const maxRatio = input.maxHeartRate
    ? input.maxHeartRate / aerobicThresholdHr
    : null;
  const evidence = buildRatioEvidence("aerobic threshold HR", avgRatio, maxRatio);

  if (avgRatio !== null && avgRatio >= 1) {
    return { level: "controlled", evidence, source: "aerobic_threshold_hr" };
  }

  if (maxRatio !== null && maxRatio >= 1.08) {
    return { level: "controlled", evidence, source: "aerobic_threshold_hr" };
  }

  if (avgRatio !== null || maxRatio !== null) {
    return { level: "easy", evidence, source: "aerobic_threshold_hr" };
  }

  return emptyClassification("aerobic_threshold_hr");
}

function classifyFromMaxHeartRate(input: {
  runnerProfile: RunnerProfile;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}): PhysiologyEffortClassification {
  const maxHr = input.runnerProfile.max_heart_rate;

  if (!isReasonableHeartRate(maxHr)) {
    return emptyClassification("max_hr");
  }

  const avgRatio = input.avgHeartRate ? input.avgHeartRate / maxHr : null;
  const maxRatio = input.maxHeartRate ? input.maxHeartRate / maxHr : null;
  const evidence = buildRatioEvidence("max HR", avgRatio, maxRatio);

  if (
    (maxRatio !== null && maxRatio >= 0.96) ||
    (avgRatio !== null && avgRatio >= 0.92)
  ) {
    return { level: "near_max", evidence, source: "max_hr" };
  }

  if (avgRatio !== null && avgRatio >= 0.85) {
    return { level: "hard", evidence, source: "max_hr" };
  }

  if (avgRatio !== null && avgRatio >= 0.75) {
    return { level: "controlled", evidence, source: "max_hr" };
  }

  if (avgRatio !== null || maxRatio !== null) {
    return { level: "easy", evidence, source: "max_hr" };
  }

  return emptyClassification("max_hr");
}

function classifyFromPowerZones(input: {
  runnerProfile: RunnerProfile;
  stravaEvidence: StravaActivityEvidence | null;
}): PhysiologyEffortClassification {
  const zones = getValidPowerZones(input.runnerProfile.user_power_zones);
  const averagePower = getEvidencePower(input.stravaEvidence);

  if (zones.length < 3 || averagePower === null) {
    return emptyClassification("power_zones");
  }

  const zoneIndex = zones.findIndex(
    (zone) =>
      averagePower >= zone.lower_watts &&
      averagePower <= zone.upper_watts,
  );

  if (zoneIndex < 0) {
    return emptyClassification("power_zones");
  }

  const zoneNumber = zoneIndex + 1;

  return {
    level:
      zoneNumber >= 5
        ? "near_max"
        : zoneNumber >= 4
          ? "hard"
          : zoneNumber >= 3
            ? "controlled"
            : "easy",
    evidence: [`personal power zone ${zoneNumber}`],
    source: "power_zones",
  };
}

function classifyFromThresholdPower(input: {
  runnerProfile: RunnerProfile;
  stravaEvidence: StravaActivityEvidence | null;
}): PhysiologyEffortClassification {
  const thresholdPower = getThresholdPowerWatts(input.runnerProfile);
  const averagePower = getEvidencePower(input.stravaEvidence);

  if (thresholdPower === null || averagePower === null) {
    return emptyClassification("threshold_power");
  }

  const ratio = averagePower / thresholdPower;
  const evidence = [`average power ${Math.round(ratio * 100)}% of threshold power`];

  if (ratio >= 1.05) {
    return { level: "near_max", evidence, source: "threshold_power" };
  }

  if (ratio >= 0.9) {
    return { level: "hard", evidence, source: "threshold_power" };
  }

  if (ratio >= 0.75) {
    return { level: "controlled", evidence, source: "threshold_power" };
  }

  return { level: "easy", evidence, source: "threshold_power" };
}

function emptyClassification(
  source: NonNullable<PhysiologyEffortClassification["source"]>,
): PhysiologyEffortClassification {
  return {
    level: null,
    evidence: [],
    source,
  };
}

function getEvidencePower(evidence: StravaActivityEvidence | null): number | null {
  if (!evidence) {
    return null;
  }

  return (
    getReasonablePower(evidence.weightedAveragePowerWatts) ??
    getReasonablePower(evidence.averagePowerWatts)
  );
}

function getEasyPowerRange(runnerProfile: RunnerProfile): string | null {
  const easyPowerMin = getReasonablePower(runnerProfile.easy_power_min_watts);
  const easyPowerMax = getReasonablePower(runnerProfile.easy_power_max_watts);

  if (
    easyPowerMin === null ||
    easyPowerMax === null ||
    easyPowerMin > easyPowerMax
  ) {
    return null;
  }

  return `${easyPowerMin}-${easyPowerMax} W`;
}

function getValidHeartRateZones(
  zones: UserHeartRateZone[] | null,
): ValidHeartRateZone[] {
  if (!Array.isArray(zones)) {
    return [];
  }

  return zones
    .filter(
      (zone): zone is ValidHeartRateZone =>
        zone !== null &&
        typeof zone === "object" &&
        isReasonableHeartRate(zone.lower_bpm) &&
        isReasonableHeartRate(zone.upper_bpm) &&
        zone.lower_bpm <= zone.upper_bpm,
    )
    .sort((a, b) => a.lower_bpm - b.lower_bpm);
}

function getValidPowerZones(zones: UserPowerZone[] | null): ValidPowerZone[] {
  if (!Array.isArray(zones)) {
    return [];
  }

  return zones
    .filter(
      (zone): zone is ValidPowerZone =>
        zone !== null &&
        typeof zone === "object" &&
        getReasonablePower(zone.lower_watts) !== null &&
        getReasonablePower(zone.upper_watts) !== null &&
        zone.lower_watts <= zone.upper_watts,
    )
    .sort((a, b) => a.lower_watts - b.lower_watts);
}

function formatHeartRateZone(zone: ValidHeartRateZone | null): string | null {
  if (!zone) {
    return null;
  }

  const name = zone.name.trim() || (zone.zone ? `Zone ${zone.zone}` : "HR zone");

  return `${name} (${zone.lower_bpm}-${zone.upper_bpm} bpm)`;
}

function combineZoneLabels(
  zones: Array<ValidHeartRateZone | null>,
): string | null {
  const validZones = zones.filter((zone): zone is ValidHeartRateZone => zone !== null);

  if (validZones.length === 0) {
    return null;
  }

  if (validZones.length === 1) {
    return formatHeartRateZone(validZones[0]);
  }

  return `${validZones[0].name}-${validZones[validZones.length - 1].name} (${validZones[0].lower_bpm}-${validZones[validZones.length - 1].upper_bpm} bpm)`;
}

function formatPowerZone(zone: ValidPowerZone | null): string | null {
  if (!zone) {
    return null;
  }

  const name = zone.name.trim() || (zone.zone ? `Zone ${zone.zone}` : "Power zone");

  return `${name} (${zone.lower_watts}-${zone.upper_watts} W)`;
}

function combinePowerZoneLabels(
  zones: Array<ValidPowerZone | null>,
): string | null {
  const validZones = zones.filter((zone): zone is ValidPowerZone => zone !== null);

  if (validZones.length === 0) {
    return null;
  }

  if (validZones.length === 1) {
    return formatPowerZone(validZones[0]);
  }

  return `${validZones[0].name}-${validZones[validZones.length - 1].name} (${validZones[0].lower_watts}-${validZones[validZones.length - 1].upper_watts} W)`;
}

function bpmRange(min: number, max: number): string {
  return `${Math.round(min)}-${Math.round(max)} bpm`;
}

function wattsRange(min: number, max: number): string {
  return `${Math.round(min)}-${Math.round(max)} W`;
}

function heartRateReserveRange(
  runnerProfile: RunnerProfile,
  minRatio: number,
  maxRatio: number,
): string {
  const restingHr = runnerProfile.resting_heart_rate ?? 0;
  const maxHr = runnerProfile.max_heart_rate ?? restingHr;
  const reserve = maxHr - restingHr;

  return bpmRange(restingHr + reserve * minRatio, restingHr + reserve * maxRatio);
}

function isReasonableHeartRate(value: number | null): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 40 &&
    value <= 250
  );
}

function getReasonablePower(value: number | null): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 30 ||
    value > 900
  ) {
    return null;
  }

  return Math.round(value);
}

function buildRatioEvidence(
  label: string,
  avgRatio: number | null,
  maxRatio: number | null,
): string[] {
  const evidence: string[] = [];

  if (avgRatio !== null) {
    evidence.push(`average HR ${Math.round(avgRatio * 100)}% of ${label}`);
  }

  if (maxRatio !== null) {
    evidence.push(`max HR ${Math.round(maxRatio * 100)}% of ${label}`);
  }

  return evidence;
}

export function isZoneSource(value: unknown): value is PhysiologyZoneSource {
  return (
    value === "manual" ||
    value === "garmin" ||
    value === "lab" ||
    value === "other"
  );
}
