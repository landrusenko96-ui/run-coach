"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchFirstProfile } from "@/lib/db/profiles";
import {
  fetchActiveRaceGoal,
  saveRaceGoal,
  type SaveRaceGoalInput,
} from "@/lib/db/raceGoals";
import type { Profile, RaceDistance, RaceGoal, TargetPriority } from "@/types";

type FormStatus = "loading" | "ready" | "saving" | "saved" | "error";

type FormState = {
  race_name: string;
  race_date: string;
  distance: RaceDistance;
  target_hours: string;
  target_minutes: string;
  target_seconds: string;
  target_priority: TargetPriority;
  course_elevation_notes: string;
  expected_weather_notes: string;
};

const emptyForm: FormState = {
  race_name: "",
  race_date: "",
  distance: "marathon",
  target_hours: "",
  target_minutes: "",
  target_seconds: "",
  target_priority: "finish",
  course_elevation_notes: "",
  expected_weather_notes: "",
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500";

const labelClass = "text-sm font-medium text-slate-800";

const priorityOptions: {
  value: TargetPriority;
  label: string;
  description: string;
}[] = [
  {
    value: "finish",
    label: "Finish",
    description: "The main goal is completing the race safely.",
  },
  {
    value: "personal_best",
    label: "PR",
    description: "You want to beat your previous best time.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "A stretch goal with more training risk.",
  },
];

function optionalText(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function secondsToTimeParts(value: number | null): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  if (value === null) {
    return {
      hours: "",
      minutes: "",
      seconds: "",
    };
  }

  const hours = Math.floor(value / 3600);
  const remainingSeconds = value % 3600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return {
    hours: String(hours),
    minutes: String(minutes),
    seconds: String(seconds),
  };
}

function raceGoalToForm(raceGoal: RaceGoal): FormState {
  const targetTime = secondsToTimeParts(raceGoal.target_finish_time_sec);

  return {
    race_name: raceGoal.race_name,
    race_date: raceGoal.race_date,
    distance: raceGoal.distance,
    target_hours: targetTime.hours,
    target_minutes: targetTime.minutes,
    target_seconds: targetTime.seconds,
    target_priority: raceGoal.target_priority,
    course_elevation_notes: raceGoal.course_elevation_notes ?? "",
    expected_weather_notes: raceGoal.expected_weather_notes ?? "",
  };
}

function optionalTimePart(value: string, label: string): number {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return 0;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsedValue;
}

function buildTargetFinishTimeSeconds(form: FormState): number | null {
  const hasAnyTimeValue =
    form.target_hours.trim() !== "" ||
    form.target_minutes.trim() !== "" ||
    form.target_seconds.trim() !== "";

  if (!hasAnyTimeValue) {
    return null;
  }

  const hours = optionalTimePart(form.target_hours, "Target hours");
  const minutes = optionalTimePart(form.target_minutes, "Target minutes");
  const seconds = optionalTimePart(form.target_seconds, "Target seconds");

  if (minutes > 59) {
    throw new Error("Target minutes must be between 0 and 59.");
  }

  if (seconds > 59) {
    throw new Error("Target seconds must be between 0 and 59.");
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  if (totalSeconds <= 0) {
    throw new Error("Target finish time must be greater than zero.");
  }

  return totalSeconds;
}

function buildRaceGoalInput(
  form: FormState,
  profileId: string,
): SaveRaceGoalInput {
  const raceName = form.race_name.trim();

  if (!raceName) {
    throw new Error("Race name is required.");
  }

  if (!form.race_date) {
    throw new Error("Race date is required.");
  }

  return {
    profile_id: profileId,
    race_name: raceName,
    race_date: form.race_date,
    distance: form.distance,
    target_finish_time_sec: buildTargetFinishTimeSeconds(form),
    target_priority: form.target_priority,
    course_elevation_notes: optionalText(form.course_elevation_notes),
    expected_weather_notes: optionalText(form.expected_weather_notes),
    is_active: true,
  };
}

function calculateWeeksRemaining(raceDate: string): string {
  if (!raceDate) {
    return "Choose a race date to see weeks remaining.";
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const raceDateStart = new Date(`${raceDate}T00:00:00`);
  const differenceMs = raceDateStart.getTime() - todayStart.getTime();
  const daysRemaining = Math.ceil(differenceMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return "This race date is in the past.";
  }

  if (daysRemaining === 0) {
    return "Race day is today.";
  }

  const weeks = Math.floor(daysRemaining / 7);
  const days = daysRemaining % 7;

  if (weeks === 0) {
    return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining.`;
  }

  if (days === 0) {
    return `${weeks} week${weeks === 1 ? "" : "s"} remaining.`;
  }

  return `${weeks} week${weeks === 1 ? "" : "s"} and ${days} day${
    days === 1 ? "" : "s"
  } remaining.`;
}

export function RaceGoalForm() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [raceGoal, setRaceGoal] = useState<RaceGoal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<FormStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRaceGoal() {
      try {
        const loadedProfile = await fetchFirstProfile();

        if (!isMounted) {
          return;
        }

        if (!loadedProfile) {
          setStatus("ready");
          setMessage("Create and save a Profile first, then come back here.");
          return;
        }

        setProfile(loadedProfile);

        const loadedRaceGoal = await fetchActiveRaceGoal(loadedProfile.id);

        if (!isMounted) {
          return;
        }

        if (loadedRaceGoal) {
          setRaceGoal(loadedRaceGoal);
          setForm(raceGoalToForm(loadedRaceGoal));
          setMessage("Loaded your active race goal.");
        } else {
          setMessage("No race goal exists yet. Fill this in and save it once.");
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
            : "Could not load your race goal.",
        );
      }
    }

    loadRaceGoal();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) {
      setStatus("error");
      setMessage("Create and save a Profile first, then come back here.");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const raceGoalInput = buildRaceGoalInput(form, profile.id);
      const savedRaceGoal = await saveRaceGoal(raceGoalInput, raceGoal?.id);

      setRaceGoal(savedRaceGoal);
      setForm(raceGoalToForm(savedRaceGoal));
      setStatus("saved");
      setMessage("Race goal saved.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save your race goal.",
      );
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Loading race goal...
      </div>
    );
  }

  const isSaving = status === "saving";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            status === "error" || !profile
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Race details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Race name
            <input
              className={inputClass}
              value={form.race_name}
              onChange={(event) =>
                setForm({ ...form, race_name: event.target.value })
              }
              placeholder="Toronto Waterfront Marathon"
              required
            />
          </label>

          <label className={labelClass}>
            Race date
            <input
              className={inputClass}
              type="date"
              value={form.race_date}
              onChange={(event) =>
                setForm({ ...form, race_date: event.target.value })
              }
              required
            />
          </label>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {calculateWeeksRemaining(form.race_date)}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">
          Distance and priority
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Distance
            <select
              className={inputClass}
              value={form.distance}
              onChange={(event) =>
                setForm({
                  ...form,
                  distance: event.target.value as RaceDistance,
                })
              }
            >
              <option value="marathon">Marathon</option>
              <option value="half_marathon">Half marathon</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
          <p className={labelClass}>Target priority</p>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {priorityOptions.map((option) => (
              <label
                key={option.value}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
              >
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <input
                    type="radio"
                    name="target_priority"
                    value={option.value}
                    checked={form.target_priority === option.value}
                    onChange={() =>
                      setForm({ ...form, target_priority: option.value })
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
        <h2 className="text-base font-medium text-slate-950">
          Target finish time
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Optional. Enter the goal time as hours, minutes, and seconds.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            Hours
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              min="0"
              value={form.target_hours}
              onChange={(event) =>
                setForm({ ...form, target_hours: event.target.value })
              }
              placeholder="4"
            />
          </label>

          <label className={labelClass}>
            Minutes
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              value={form.target_minutes}
              onChange={(event) =>
                setForm({ ...form, target_minutes: event.target.value })
              }
              placeholder="15"
            />
          </label>

          <label className={labelClass}>
            Seconds
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              value={form.target_seconds}
              onChange={(event) =>
                setForm({ ...form, target_seconds: event.target.value })
              }
              placeholder="0"
            />
          </label>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <h2 className="text-base font-medium text-slate-950">Race notes</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Course elevation notes
            <textarea
              className={`${inputClass} min-h-28`}
              value={form.course_elevation_notes}
              onChange={(event) =>
                setForm({
                  ...form,
                  course_elevation_notes: event.target.value,
                })
              }
              placeholder="Optional. Example: rolling hills, flat finish."
            />
          </label>

          <label className={labelClass}>
            Expected weather notes
            <textarea
              className={`${inputClass} min-h-28`}
              value={form.expected_weather_notes}
              onChange={(event) =>
                setForm({
                  ...form,
                  expected_weather_notes: event.target.value,
                })
              }
              placeholder="Optional. Example: likely cool morning, possible wind."
            />
          </label>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {raceGoal
            ? "Saving will update your active race goal."
            : "Saving will create your active race goal."}
        </p>
        <button
          type="submit"
          disabled={isSaving || !profile}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSaving ? "Saving..." : "Save race goal"}
        </button>
      </div>
    </form>
  );
}
