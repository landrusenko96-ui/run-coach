"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  fetchFirstProfile,
  saveProfile,
  type SaveProfileInput,
} from "@/lib/db/profiles";
import {
  getDefaultRunningDaysPerWeek,
  getEffectiveRunningDaysPerWeek,
  parseRunningDaysPerWeek,
  runningDaysPerWeekOptions,
} from "@/lib/training/runningDays";
import type {
  ExperienceLevel,
  Profile,
  RecentTrainingWeekInput,
  Sex,
  TerrainAvailable,
  TrainingAggressiveness,
  TrainingDay,
  TypicalElevationProfile,
  TypicalSurface,
} from "@/types/training";

const dayOptions: { value: TrainingDay; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const terrainOptions: { value: TerrainAvailable; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "hills", label: "Hills" },
  { value: "track", label: "Track" },
  { value: "treadmill", label: "Treadmill" },
  { value: "trails", label: "Trails" },
  { value: "downhill", label: "Downhill" },
];

const sexOptions: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const aggressivenessOptions: {
  value: TrainingAggressiveness;
  label: string;
  description: string;
}[] = [
  {
    value: "relaxed",
    label: "Relaxed",
    description: "Lower risk, slower increases.",
  },
  {
    value: "moderate",
    label: "Moderate",
    description: "Default option for steady progress.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Higher workload, more risk.",
  },
  {
    value: "very_aggressive",
    label: "Very aggressive",
    description: "Largest workload increases. Use carefully.",
  },
];

const experienceOptions: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const surfaceOptions: { value: TypicalSurface; label: string }[] = [
  { value: "road", label: "Road" },
  { value: "trail", label: "Trail" },
  { value: "track", label: "Track" },
  { value: "treadmill", label: "Treadmill" },
  { value: "mixed", label: "Mixed" },
];

const elevationOptions: { value: TypicalElevationProfile; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "rolling", label: "Rolling" },
  { value: "hilly", label: "Hilly" },
  { value: "mountainous", label: "Mountainous" },
  { value: "mixed", label: "Mixed" },
];

type ManualHistoryWeekForm = {
  week_start_date: string;
  week_end_date: string;
  distance_km: string;
  duration_min: string;
  run_count: string;
  longest_run_km: string;
};

type FormState = {
  username: string;
  display_name: string;
  birth_year: string;
  sex: Sex | "";
  height_cm: string;
  weight_kg: string;
  current_weekly_mileage_km: string;
  longest_recent_run_km: string;
  easy_pace_min_per_km: string;
  threshold_pace_min_per_km: string;
  max_heart_rate: string;
  resting_heart_rate: string;
  available_training_days: TrainingDay[];
  running_days_per_week: string;
  preferred_long_run_day: TrainingDay | "";
  terrain_available: TerrainAvailable[];
  training_aggressiveness: TrainingAggressiveness;
  injury_notes: string;
  maximum_weekday_session_duration_min: string;
  maximum_weekend_session_duration_min: string;
  running_experience_level: ExperienceLevel | "";
  previous_half_marathon_history: string;
  previous_marathon_history: string;
  current_pain_or_injury: boolean;
  serious_recent_injury: boolean;
  injury_risk_notes: string;
  preferred_rest_day: TrainingDay | "";
  preferred_workout_days: TrainingDay[];
  cross_training_available: boolean;
  double_run_willingness: boolean;
  typical_surface: TypicalSurface | "";
  typical_elevation_profile: TypicalElevationProfile | "";
  manual_six_week_history: ManualHistoryWeekForm[];
};

type FormStatus = "loading" | "ready" | "saving" | "saved" | "error";

const emptyForm: FormState = {
  username: "runner",
  display_name: "",
  birth_year: "",
  sex: "",
  height_cm: "",
  weight_kg: "",
  current_weekly_mileage_km: "",
  longest_recent_run_km: "",
  easy_pace_min_per_km: "",
  threshold_pace_min_per_km: "",
  max_heart_rate: "",
  resting_heart_rate: "",
  available_training_days: [],
  running_days_per_week: "",
  preferred_long_run_day: "",
  terrain_available: [],
  training_aggressiveness: "moderate",
  injury_notes: "",
  maximum_weekday_session_duration_min: "",
  maximum_weekend_session_duration_min: "",
  running_experience_level: "",
  previous_half_marathon_history: "",
  previous_marathon_history: "",
  current_pain_or_injury: false,
  serious_recent_injury: false,
  injury_risk_notes: "",
  preferred_rest_day: "",
  preferred_workout_days: [],
  cross_training_available: false,
  double_run_willingness: false,
  typical_surface: "",
  typical_elevation_profile: "",
  manual_six_week_history: buildEmptyManualHistoryWeeks(),
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500";

const labelClass = "text-sm font-medium text-slate-800";

function getLocalDateText(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateText(dateText: string, daysToAdd: number): string {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + daysToAdd);

  return getLocalDateText(date);
}

function buildEmptyManualHistoryWeeks(): ManualHistoryWeekForm[] {
  const endDate = getLocalDateText();
  const startDate = addDaysToDateText(endDate, -41);

  return Array.from({ length: 6 }, (_, index) => {
    const weekStartDate = addDaysToDateText(startDate, index * 7);

    return {
      week_start_date: weekStartDate,
      week_end_date:
        index === 5 ? endDate : addDaysToDateText(weekStartDate, 6),
      distance_km: "",
      duration_min: "",
      run_count: "",
      longest_run_km: "",
    };
  });
}

function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function booleanToInput(value: boolean | null | undefined): boolean {
  return value === true;
}

function secondsToPaceInput(value: number | null): string {
  if (value === null) {
    return "";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function secondsToMinutesInput(value: number | null): string {
  return value === null ? "" : String(Math.round(value / 60));
}

function normalizeTrainingAggressiveness(
  value: TrainingAggressiveness | "conservative" | "balanced",
): TrainingAggressiveness {
  if (value === "conservative") {
    return "relaxed";
  }

  if (value === "balanced") {
    return "moderate";
  }

  return value;
}

function manualHistoryToForm(
  manualHistory: RecentTrainingWeekInput[] | null,
): ManualHistoryWeekForm[] {
  const fallbackWeeks = buildEmptyManualHistoryWeeks();

  if (!Array.isArray(manualHistory) || manualHistory.length === 0) {
    return fallbackWeeks;
  }

  return fallbackWeeks.map((fallbackWeek, index) => {
    const week = manualHistory[index];

    if (!week) {
      return fallbackWeek;
    }

    return {
      week_start_date: week.week_start_date || fallbackWeek.week_start_date,
      week_end_date: week.week_end_date || fallbackWeek.week_end_date,
      distance_km: numberToInput(week.distance_km),
      duration_min: secondsToMinutesInput(week.duration_sec),
      run_count: numberToInput(week.run_count),
      longest_run_km: numberToInput(week.longest_run_km),
    };
  });
}

function profileToForm(profile: Profile): FormState {
  return {
    username: profile.username,
    display_name: profile.display_name,
    birth_year: numberToInput(profile.birth_year),
    sex: profile.sex ?? "",
    height_cm: numberToInput(profile.height_cm),
    weight_kg: numberToInput(profile.weight_kg),
    current_weekly_mileage_km: numberToInput(
      profile.current_weekly_mileage_km,
    ),
    longest_recent_run_km: numberToInput(profile.longest_recent_run_km),
    easy_pace_min_per_km: secondsToPaceInput(profile.easy_pace_sec_per_km),
    threshold_pace_min_per_km: secondsToPaceInput(
      profile.threshold_pace_sec_per_km,
    ),
    max_heart_rate: numberToInput(profile.max_heart_rate),
    resting_heart_rate: numberToInput(profile.resting_heart_rate),
    available_training_days: profile.available_training_days,
    running_days_per_week: numberToInput(profile.running_days_per_week),
    preferred_long_run_day: profile.preferred_long_run_day ?? "",
    terrain_available: profile.terrain_available,
    training_aggressiveness: normalizeTrainingAggressiveness(
      profile.training_aggressiveness as
        | TrainingAggressiveness
        | "conservative"
        | "balanced",
    ),
    injury_notes: profile.injury_notes ?? "",
    maximum_weekday_session_duration_min: numberToInput(
      profile.maximum_weekday_session_duration_min,
    ),
    maximum_weekend_session_duration_min: numberToInput(
      profile.maximum_weekend_session_duration_min,
    ),
    running_experience_level: profile.running_experience_level ?? "",
    previous_half_marathon_history:
      profile.previous_half_marathon_history ?? "",
    previous_marathon_history: profile.previous_marathon_history ?? "",
    current_pain_or_injury: booleanToInput(profile.current_pain_or_injury),
    serious_recent_injury: booleanToInput(profile.serious_recent_injury),
    injury_risk_notes: profile.injury_risk_notes ?? "",
    preferred_rest_day: profile.preferred_rest_day ?? "",
    preferred_workout_days: profile.preferred_workout_days ?? [],
    cross_training_available: booleanToInput(profile.cross_training_available),
    double_run_willingness: booleanToInput(profile.double_run_willingness),
    typical_surface: profile.typical_surface ?? "",
    typical_elevation_profile: profile.typical_elevation_profile ?? "",
    manual_six_week_history: manualHistoryToForm(
      profile.manual_six_week_history,
    ),
  };
}

function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function optionalInteger(value: string, label: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsedValue;
}

function optionalDecimal(value: string, label: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(`${label} must be a number.`);
  }

  return parsedValue;
}

function paceInputToSeconds(value: string, label: string): number | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return null;
  }

  if (trimmedValue.includes(":")) {
    const [minutesText, secondsText] = trimmedValue.split(":");
    const minutes = Number(minutesText);
    const seconds = Number(secondsText);

    if (
      !Number.isInteger(minutes) ||
      !Number.isInteger(seconds) ||
      minutes < 0 ||
      seconds < 0 ||
      seconds > 59
    ) {
      throw new Error(`${label} must look like 6:30.`);
    }

    const totalSeconds = minutes * 60 + seconds;

    if (totalSeconds <= 0) {
      throw new Error(`${label} must be greater than zero.`);
    }

    return totalSeconds;
  }

  const decimalMinutes = Number(trimmedValue);

  if (!Number.isFinite(decimalMinutes) || decimalMinutes <= 0) {
    throw new Error(`${label} must look like 6:30 or 6.5.`);
  }

  return Math.round(decimalMinutes * 60);
}

function optionalSessionDuration(value: string, label: string): number | null {
  const duration = optionalInteger(value, label);

  if (duration !== null && duration < 10) {
    throw new Error(`${label} must be at least 10 minutes.`);
  }

  return duration;
}

function manualHistoryHasInput(weeks: ManualHistoryWeekForm[]): boolean {
  return weeks.some(
    (week) =>
      week.distance_km.trim() ||
      week.duration_min.trim() ||
      week.run_count.trim() ||
      week.longest_run_km.trim(),
  );
}

function buildManualHistoryInput(
  weeks: ManualHistoryWeekForm[],
): RecentTrainingWeekInput[] | null {
  if (!manualHistoryHasInput(weeks)) {
    return null;
  }

  return weeks.map((week, index) => {
    const distanceKm =
      optionalDecimal(week.distance_km, `Manual history week ${index + 1} distance`) ??
      0;
    const durationMin = optionalInteger(
      week.duration_min,
      `Manual history week ${index + 1} duration`,
    );
    const runCount =
      optionalInteger(week.run_count, `Manual history week ${index + 1} run count`) ??
      0;
    const longestRunKm = optionalDecimal(
      week.longest_run_km,
      `Manual history week ${index + 1} longest run`,
    );

    if (distanceKm < 0 || runCount < 0 || (longestRunKm ?? 0) < 0) {
      throw new Error("Manual history values cannot be negative.");
    }

    if (runCount > 0 && distanceKm <= 0) {
      throw new Error(
        `Manual history week ${index + 1} needs distance when run count is greater than zero.`,
      );
    }

    return {
      week_start_date: week.week_start_date,
      week_end_date: week.week_end_date,
      distance_km: distanceKm,
      duration_sec: durationMin === null ? null : durationMin * 60,
      run_count: runCount,
      longest_run_km: longestRunKm,
      longest_run_duration_sec: null,
      source: "manual",
    };
  });
}

function buildProfileInput(form: FormState): SaveProfileInput {
  const username = form.username.trim();
  const displayName = form.display_name.trim();

  if (!username) {
    throw new Error("Username is required.");
  }

  if (!displayName) {
    throw new Error("Display name is required.");
  }

  const runningDaysPerWeek = parseRunningDaysPerWeek(
    optionalInteger(form.running_days_per_week, "Running days per week"),
  );
  const effectiveRunningDaysPerWeek = getEffectiveRunningDaysPerWeek({
    running_days_per_week: runningDaysPerWeek,
    training_aggressiveness: form.training_aggressiveness,
  });
  const manualHistory = buildManualHistoryInput(form.manual_six_week_history);

  if (form.available_training_days.length < effectiveRunningDaysPerWeek) {
    throw new Error(
      `Choose at least ${effectiveRunningDaysPerWeek} available training days, or lower Running days per week.`,
    );
  }

  return {
    username,
    display_name: displayName,
    birth_year: optionalInteger(form.birth_year, "Birth year"),
    sex: form.sex === "" ? null : form.sex,
    height_cm: optionalInteger(form.height_cm, "Height"),
    weight_kg: optionalDecimal(form.weight_kg, "Weight"),
    current_weekly_mileage_km: optionalDecimal(
      form.current_weekly_mileage_km,
      "Current weekly mileage",
    ),
    longest_recent_run_km: optionalDecimal(
      form.longest_recent_run_km,
      "Longest recent run",
    ),
    easy_pace_sec_per_km: paceInputToSeconds(
      form.easy_pace_min_per_km,
      "Easy pace",
    ),
    threshold_pace_sec_per_km: paceInputToSeconds(
      form.threshold_pace_min_per_km,
      "Threshold pace",
    ),
    max_heart_rate: optionalInteger(form.max_heart_rate, "Max heart rate"),
    resting_heart_rate: optionalInteger(
      form.resting_heart_rate,
      "Resting heart rate",
    ),
    available_training_days: form.available_training_days,
    running_days_per_week: runningDaysPerWeek,
    preferred_long_run_day:
      form.preferred_long_run_day === "" ? null : form.preferred_long_run_day,
    terrain_available: form.terrain_available,
    training_aggressiveness: form.training_aggressiveness,
    injury_notes: optionalText(form.injury_notes),
    maximum_weekday_session_duration_min: optionalSessionDuration(
      form.maximum_weekday_session_duration_min,
      "Maximum weekday session duration",
    ),
    maximum_weekend_session_duration_min: optionalSessionDuration(
      form.maximum_weekend_session_duration_min,
      "Maximum weekend session duration",
    ),
    running_experience_level:
      form.running_experience_level === "" ? null : form.running_experience_level,
    previous_half_marathon_history: optionalText(
      form.previous_half_marathon_history,
    ),
    previous_marathon_history: optionalText(form.previous_marathon_history),
    current_pain_or_injury: form.current_pain_or_injury,
    serious_recent_injury: form.serious_recent_injury,
    injury_risk_notes: optionalText(form.injury_risk_notes),
    preferred_rest_day:
      form.preferred_rest_day === "" ? null : form.preferred_rest_day,
    preferred_workout_days: form.preferred_workout_days,
    cross_training_available: form.cross_training_available,
    double_run_willingness: form.double_run_willingness,
    typical_surface: form.typical_surface === "" ? null : form.typical_surface,
    typical_elevation_profile:
      form.typical_elevation_profile === ""
        ? null
        : form.typical_elevation_profile,
    manual_six_week_history: manualHistory,
    manual_six_week_history_updated_at: manualHistory ? new Date().toISOString() : null,
  };
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function ProfileForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<FormStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const loadedProfile = await fetchFirstProfile();

        if (!isMounted) {
          return;
        }

        if (loadedProfile) {
          setProfile(loadedProfile);
          setForm(profileToForm(loadedProfile));
          setMessage("Loaded your saved profile.");
        } else {
          setMessage("No profile exists yet. Fill this in and save it once.");
        }

        setStatus("ready");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load your profile.",
        );
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    try {
      const profileInput = buildProfileInput(form);
      const savedProfile = await saveProfile(profileInput, profile?.id);

      setProfile(savedProfile);
      setForm(profileToForm(savedProfile));
      setStatus("saved");
      setMessage("Profile saved.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save your profile.",
      );
    }
  }

  const isSaving = status === "saving";
  const isLoading = status === "loading";

  if (isLoading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading profile...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Basic details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Username
            <input
              className={inputClass}
              value={form.username}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
              required
            />
          </label>

          <label className={labelClass}>
            Display name
            <input
              className={inputClass}
              value={form.display_name}
              onChange={(event) =>
                setForm({ ...form, display_name: event.target.value })
              }
              required
            />
          </label>

          <label className={labelClass}>
            Birth year
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.birth_year}
              onChange={(event) =>
                setForm({ ...form, birth_year: event.target.value })
              }
              placeholder="1990"
            />
          </label>

          <label className={labelClass}>
            Sex
            <select
              className={inputClass}
              value={form.sex}
              onChange={(event) =>
                setForm({ ...form, sex: event.target.value as Sex | "" })
              }
            >
              <option value="">Not set</option>
              {sexOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">
          Body and training baseline
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Height (cm)
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.height_cm}
              onChange={(event) =>
                setForm({ ...form, height_cm: event.target.value })
              }
              placeholder="178"
            />
          </label>

          <label className={labelClass}>
            Weight (kg)
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.weight_kg}
              onChange={(event) =>
                setForm({ ...form, weight_kg: event.target.value })
              }
              placeholder="75"
            />
          </label>

          <label className={labelClass}>
            Current weekly mileage (km)
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.current_weekly_mileage_km}
              onChange={(event) =>
                setForm({
                  ...form,
                  current_weekly_mileage_km: event.target.value,
                })
              }
              placeholder="30"
            />
          </label>

          <label className={labelClass}>
            Longest recent run (km)
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.longest_recent_run_km}
              onChange={(event) =>
                setForm({ ...form, longest_recent_run_km: event.target.value })
              }
              placeholder="16"
            />
          </label>

          <label className={labelClass}>
            Running experience
            <select
              className={inputClass}
              value={form.running_experience_level}
              onChange={(event) =>
                setForm({
                  ...form,
                  running_experience_level: event.target
                    .value as ExperienceLevel | "",
                })
              }
            >
              <option value="">Not set</option>
              {experienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Previous half marathon history
            <textarea
              className={`${inputClass} min-h-24`}
              value={form.previous_half_marathon_history}
              onChange={(event) =>
                setForm({
                  ...form,
                  previous_half_marathon_history: event.target.value,
                })
              }
              placeholder="Optional. Example: 2 completed, best 1:55."
            />
          </label>

          <label className={labelClass}>
            Previous marathon history
            <textarea
              className={`${inputClass} min-h-24`}
              value={form.previous_marathon_history}
              onChange={(event) =>
                setForm({
                  ...form,
                  previous_marathon_history: event.target.value,
                })
              }
              placeholder="Optional. Example: first marathon, or best 4:10."
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Paces</h2>
        <p className="mt-1 text-sm text-slate-600">
          Type paces as min/km, for example 6:30.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Easy pace (min/km)
            <input
              className={inputClass}
              value={form.easy_pace_min_per_km}
              onChange={(event) =>
                setForm({ ...form, easy_pace_min_per_km: event.target.value })
              }
              placeholder="6:30"
            />
          </label>

          <label className={labelClass}>
            Threshold pace (min/km)
            <input
              className={inputClass}
              value={form.threshold_pace_min_per_km}
              onChange={(event) =>
                setForm({
                  ...form,
                  threshold_pace_min_per_km: event.target.value,
                })
              }
              placeholder="5:20"
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Heart rate</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Max heart rate
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.max_heart_rate}
              onChange={(event) =>
                setForm({ ...form, max_heart_rate: event.target.value })
              }
              placeholder="190"
            />
          </label>

          <label className={labelClass}>
            Resting heart rate
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.resting_heart_rate}
              onChange={(event) =>
                setForm({ ...form, resting_heart_rate: event.target.value })
              }
              placeholder="55"
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">
          Training availability
        </h2>

        <label className="mt-4 block text-sm font-medium text-slate-800">
          Running days per week
          <select
            className={inputClass}
            value={form.running_days_per_week}
            onChange={(event) =>
              setForm({
                ...form,
                running_days_per_week: event.target.value,
              })
            }
          >
            <option value="">
              Not set ({getDefaultRunningDaysPerWeek(
                form.training_aggressiveness,
              )} by current plan style)
            </option>
            {runningDaysPerWeekOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <p className={labelClass}>Available training days</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {dayOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={form.available_training_days.includes(option.value)}
                  onChange={() =>
                    setForm({
                      ...form,
                      available_training_days: toggleValue(
                        form.available_training_days,
                        option.value,
                      ),
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <label className={`${labelClass} mt-4 block`}>
          Preferred long run day
          <select
            className={inputClass}
            value={form.preferred_long_run_day}
            onChange={(event) =>
              setForm({
                ...form,
                preferred_long_run_day: event.target.value as TrainingDay | "",
              })
            }
          >
            <option value="">Not set</option>
            {dayOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Max weekday session (minutes)
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.maximum_weekday_session_duration_min}
              onChange={(event) =>
                setForm({
                  ...form,
                  maximum_weekday_session_duration_min: event.target.value,
                })
              }
              placeholder="60"
            />
          </label>

          <label className={labelClass}>
            Max weekend session (minutes)
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              value={form.maximum_weekend_session_duration_min}
              onChange={(event) =>
                setForm({
                  ...form,
                  maximum_weekend_session_duration_min: event.target.value,
                })
              }
              placeholder="150"
            />
          </label>

          <label className={labelClass}>
            Preferred rest day
            <select
              className={inputClass}
              value={form.preferred_rest_day}
              onChange={(event) =>
                setForm({
                  ...form,
                  preferred_rest_day: event.target.value as TrainingDay | "",
                })
              }
            >
              <option value="">Not set</option>
              {dayOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <p className={labelClass}>Preferred workout days</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {dayOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={form.preferred_workout_days.includes(option.value)}
                  onChange={() =>
                    setForm({
                      ...form,
                      preferred_workout_days: toggleValue(
                        form.preferred_workout_days,
                        option.value,
                      ),
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.cross_training_available}
              onChange={(event) =>
                setForm({
                  ...form,
                  cross_training_available: event.target.checked,
                })
              }
            />
            Cross-training available
          </label>

          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.double_run_willingness}
              onChange={(event) =>
                setForm({
                  ...form,
                  double_run_willingness: event.target.checked,
                })
              }
            />
            Willing to double run
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">
          Terrain and plan style
        </h2>

        <div className="mt-4">
          <p className={labelClass}>Terrain available</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {terrainOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={form.terrain_available.includes(option.value)}
                  onChange={() =>
                    setForm({
                      ...form,
                      terrain_available: toggleValue(
                        form.terrain_available,
                        option.value,
                      ),
                    })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Typical surface
            <select
              className={inputClass}
              value={form.typical_surface}
              onChange={(event) =>
                setForm({
                  ...form,
                  typical_surface: event.target.value as TypicalSurface | "",
                })
              }
            >
              <option value="">Not set</option>
              {surfaceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Typical elevation
            <select
              className={inputClass}
              value={form.typical_elevation_profile}
              onChange={(event) =>
                setForm({
                  ...form,
                  typical_elevation_profile: event.target
                    .value as TypicalElevationProfile | "",
                })
              }
            >
              <option value="">Not set</option>
              {elevationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <p className={labelClass}>Training aggressiveness</p>
          <div className="mt-2 grid gap-2 md:grid-cols-4">
            {aggressivenessOptions.map((option) => (
              <label
                key={option.value}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <input
                    type="radio"
                    name="training_aggressiveness"
                    value={option.value}
                    checked={form.training_aggressiveness === option.value}
                    onChange={() =>
                      setForm({
                        ...form,
                        training_aggressiveness: option.value,
                      })
                    }
                  />
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Injury notes</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.current_pain_or_injury}
              onChange={(event) =>
                setForm({
                  ...form,
                  current_pain_or_injury: event.target.checked,
                })
              }
            />
            Current pain or injury
          </label>

          <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.serious_recent_injury}
              onChange={(event) =>
                setForm({
                  ...form,
                  serious_recent_injury: event.target.checked,
                })
              }
            />
            Serious recent injury
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-800">
          Anything the training plan should be careful about?
          <textarea
            className={`${inputClass} min-h-28`}
            value={form.injury_notes}
            onChange={(event) =>
              setForm({ ...form, injury_notes: event.target.value })
            }
            placeholder="Optional. Example: mild knee pain after long downhill runs."
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-800">
          Injury risk notes
          <textarea
            className={`${inputClass} min-h-24`}
            value={form.injury_risk_notes}
            onChange={(event) =>
              setForm({ ...form, injury_risk_notes: event.target.value })
            }
            placeholder="Optional. Example: history of Achilles pain above 50 km/week."
          />
        </label>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">
          Manual six-week history
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Fill this only when app logs and Strava do not cover the last six
          weeks.
        </p>
        <div className="mt-4 space-y-3">
          {form.manual_six_week_history.map((week, index) => (
            <div
              key={`${week.week_start_date}-${index}`}
              className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5"
            >
              <div className="text-sm text-slate-700">
                <span className="font-medium text-slate-950">
                  Week {index + 1}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {week.week_start_date} to {week.week_end_date}
                </span>
              </div>

              <label className={labelClass}>
                Distance (km)
                <input
                  className={inputClass}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={week.distance_km}
                  onChange={(event) => {
                    const nextWeeks = [...form.manual_six_week_history];
                    nextWeeks[index] = {
                      ...week,
                      distance_km: event.target.value,
                    };
                    setForm({ ...form, manual_six_week_history: nextWeeks });
                  }}
                />
              </label>

              <label className={labelClass}>
                Duration (min)
                <input
                  className={inputClass}
                  type="number"
                  inputMode="numeric"
                  value={week.duration_min}
                  onChange={(event) => {
                    const nextWeeks = [...form.manual_six_week_history];
                    nextWeeks[index] = {
                      ...week,
                      duration_min: event.target.value,
                    };
                    setForm({ ...form, manual_six_week_history: nextWeeks });
                  }}
                />
              </label>

              <label className={labelClass}>
                Runs
                <input
                  className={inputClass}
                  type="number"
                  inputMode="numeric"
                  value={week.run_count}
                  onChange={(event) => {
                    const nextWeeks = [...form.manual_six_week_history];
                    nextWeeks[index] = {
                      ...week,
                      run_count: event.target.value,
                    };
                    setForm({ ...form, manual_six_week_history: nextWeeks });
                  }}
                />
              </label>

              <label className={labelClass}>
                Longest (km)
                <input
                  className={inputClass}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={week.longest_run_km}
                  onChange={(event) => {
                    const nextWeeks = [...form.manual_six_week_history];
                    nextWeeks[index] = {
                      ...week,
                      longest_run_km: event.target.value,
                    };
                    setForm({ ...form, manual_six_week_history: nextWeeks });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {profile
            ? "Saving will update the existing profile."
            : "Saving will create your first profile."}
        </p>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSaving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
