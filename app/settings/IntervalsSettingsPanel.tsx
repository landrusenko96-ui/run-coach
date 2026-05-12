"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  fetchIntervalsConnectionForProfile,
  saveIntervalsConnection,
} from "@/lib/db/intervalsConnections";
import { fetchFirstProfile } from "@/lib/db/profiles";
import type { IntervalsEnvStatus } from "@/lib/intervals/config";
import type { IntervalsConnection, Profile } from "@/types";

type FormStatus = "loading" | "ready" | "saving" | "saved" | "error";

type FormState = {
  athlete_id: string;
  is_active: boolean;
};

type IntervalsSettingsPanelProps = {
  envStatus: IntervalsEnvStatus;
};

const emptyForm: FormState = {
  athlete_id: "",
  is_active: true,
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100";

const labelClass = "text-sm font-medium text-slate-800";

function connectionToForm(connection: IntervalsConnection): FormState {
  return {
    athlete_id: connection.athlete_id,
    is_active: connection.is_active,
  };
}

function buildConnectionInput(form: FormState, profileId: string) {
  const athleteId = form.athlete_id.trim();

  if (!athleteId) {
    throw new Error("Intervals.icu athlete ID is required.");
  }

  return {
    profile_id: profileId,
    athlete_id: athleteId,
    is_active: form.is_active,
  };
}

function getStatusClass(isReady: boolean): string {
  return isReady
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

export function IntervalsSettingsPanel({
  envStatus,
}: IntervalsSettingsPanelProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<IntervalsConnection | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<FormStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
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

        const loadedConnection = await fetchIntervalsConnectionForProfile(
          loadedProfile.id,
        );

        if (!isMounted) {
          return;
        }

        if (loadedConnection) {
          setConnection(loadedConnection);
          setForm(connectionToForm(loadedConnection));
          setMessage("Loaded your Intervals.icu connection settings.");
        } else {
          setMessage("No Intervals.icu connection is saved yet.");
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
            : "Could not load Intervals.icu settings.",
        );
      }
    }

    loadSettings();

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
      const connectionInput = buildConnectionInput(form, profile.id);
      const savedConnection = await saveIntervalsConnection(
        connectionInput,
        connection?.id,
      );

      setConnection(savedConnection);
      setForm(connectionToForm(savedConnection));
      setStatus("saved");
      setMessage("Intervals.icu connection settings saved.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save Intervals.icu settings.",
      );
    }
  }

  const isSaving = status === "saving";
  const hasDatabaseConnection = connection !== null;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-base font-medium text-slate-950">
          Intervals.icu
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Save the athlete ID here. Keep the API key in .env.local or Vercel
          environment variables.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-md border px-3 py-2 text-sm ${getStatusClass(
            hasDatabaseConnection,
          )}`}
        >
          Database athlete ID: {hasDatabaseConnection ? "Saved" : "Not saved"}
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-sm ${getStatusClass(
            envStatus.apiKeyConfigured,
          )}`}
        >
          Server API key: {envStatus.apiKeyConfigured ? "Configured" : "Missing"}
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-sm ${getStatusClass(
            form.is_active,
          )}`}
        >
          Publishing status: {form.is_active ? "Active" : "Inactive"}
        </div>
        <div
          className={`rounded-md border px-3 py-2 text-sm ${getStatusClass(
            envStatus.athleteIdConfigured,
          )}`}
        >
          Server athlete ID fallback:{" "}
          {envStatus.athleteIdConfigured ? "Configured" : "Not set"}
        </div>
      </div>

      {message ? (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            status === "error" || !profile
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className={labelClass}>Intervals.icu athlete ID</span>
          <input
            className={inputClass}
            value={form.athlete_id}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                athlete_id: event.target.value,
              }))
            }
            disabled={isSaving || !profile}
            placeholder="i12345"
          />
        </label>

        <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300"
            checked={form.is_active}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                is_active: event.target.checked,
              }))
            }
            disabled={isSaving || !profile}
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">
              Connection active
            </span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              This only controls whether later publishing code should use this
              connection.
            </span>
          </span>
        </label>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          The API key is not stored or typed here. Set INTERVALS_API_KEY in
          .env.local for local development and in Vercel for deployment.
        </div>

        <button
          type="submit"
          disabled={isSaving || !profile}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isSaving ? "Saving..." : "Save Intervals.icu settings"}
        </button>
      </form>
    </section>
  );
}
