"use client";

import { useEffect, useState } from "react";
import { StravaImportSummary } from "@/components/StravaImportSummary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  StravaImportDays,
  StravaImportResponse,
  StravaStatusResponse,
} from "@/types";

type LoadState = "loading" | "ready" | "error";

const dayOptions: StravaImportDays[] = [7, 14];

function getStatusBadgeClass(isConnected: boolean): string {
  return isConnected
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function getAthleteName(status: StravaStatusResponse): string {
  return (
    status.athlete?.displayName ||
    status.athlete?.username ||
    status.athlete?.stravaAthleteId ||
    "Connected athlete"
  );
}

async function fetchStravaStatus(): Promise<StravaStatusResponse> {
  const response = await fetch("/api/strava/status");
  const result = (await response.json()) as StravaStatusResponse;

  if (!response.ok) {
    throw new Error(result.message || "Could not load Strava status.");
  }

  return result;
}

async function importStravaRuns(days: StravaImportDays): Promise<StravaImportResponse> {
  const response = await fetch("/api/strava/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ days }),
  });
  const result = (await response.json()) as StravaImportResponse;

  if (!response.ok) {
    throw new Error(result.message || "Could not import Strava runs.");
  }

  return result;
}

export function StravaSettingsPanel() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<StravaStatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importDays, setImportDays] = useState<StravaImportDays>(7);
  const [importSummary, setImportSummary] =
    useState<StravaImportResponse | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function loadStatus(showLoading: boolean) {
    if (showLoading) {
      setLoadState("loading");
    }

    try {
      const result = await fetchStravaStatus();

      setStatus(result);
      setMessage(result.message);
      setLoadState("ready");
    } catch (error) {
      setStatus(null);
      setMessage(
        error instanceof Error ? error.message : "Could not load Strava status.",
      );
      setLoadState("error");
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetchStravaStatus()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setStatus(result);
        setMessage(result.message);
        setLoadState("ready");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setStatus(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load Strava status.",
        );
        setLoadState("error");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDisconnect() {
    setIsDisconnecting(true);
    setMessage(null);
    setImportSummary(null);

    try {
      const response = await fetch("/api/strava/disconnect", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not disconnect Strava.");
      }

      setMessage(result.message);
      await loadStatus(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not disconnect Strava.",
      );
      setLoadState("error");
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleConnect() {
    setIsConnecting(true);
    setMessage(null);
    setImportSummary(null);

    try {
      if (!isAuthenticated) {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const { error } = await supabase.auth.signInAnonymously();

          if (error) {
            throw new Error(
              `Could not start the app session needed before Strava. Make sure Anonymous sign-ins are enabled in Supabase Auth. Details: ${error.message}`,
            );
          }
        }
      }

      window.location.assign("/api/strava/connect");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not start Strava connect.",
      );
      setLoadState("error");
      setIsConnecting(false);
    }
  }

  async function handleImport() {
    setIsImporting(true);
    setMessage(null);
    setImportSummary(null);

    try {
      const result = await importStravaRuns(importDays);

      setImportSummary(result);
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import Strava runs.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  const isConnected = status?.connected === true;
  const isAuthenticated = status?.authenticated === true;
  const isBusy =
    isConnecting || isImporting || isDisconnecting || loadState === "loading";

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-medium text-slate-950">Strava</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Connect Strava, then manually import recent runs into workout logs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStatus(true)}
          disabled={isBusy}
          className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {loadState === "loading" ? "Checking..." : "Refresh status"}
        </button>
      </div>

      <div
        className={`mt-4 w-fit rounded-md border px-3 py-2 text-sm font-medium ${getStatusBadgeClass(
          isConnected,
        )}`}
      >
        {isConnected ? "Connected" : "Not connected"}
      </div>

      {message ? (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            loadState === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      {isConnected && status ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-950">
            {getAthleteName(status)}
          </p>
          <p className="mt-1">Strava athlete ID: {status.athlete?.stravaAthleteId}</p>
        </div>
      ) : null}

      {!isConnected && !isAuthenticated ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">
          This button first creates a private app session in this browser, then
          sends you to Strava. The app session is needed so your Strava
          connection belongs only to you.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!isConnected ? (
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isBusy}
            className="w-fit cursor-pointer rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isConnecting ? "Opening Strava..." : "Connect Strava"}
          </button>
        ) : (
          <>
            <div className="flex w-fit rounded-md border border-slate-300 bg-white p-1">
              {dayOptions.map((days) => (
                <button
                  aria-pressed={importDays === days}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    importDays === days
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  disabled={isBusy}
                  key={days}
                  onClick={() => setImportDays(days)}
                  type="button"
                >
                  Last {days} days
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={isBusy}
              className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isImporting ? "Importing..." : "Import latest Strava runs"}
            </button>

            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isBusy}
              className="w-fit rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect Strava"}
            </button>
          </>
        )}
      </div>

      <div className="mt-5">
        <StravaImportSummary summary={importSummary} />
      </div>
    </section>
  );
}
