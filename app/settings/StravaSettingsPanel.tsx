"use client";

import { useEffect, useState } from "react";
import { StravaImportSummary } from "@/components/StravaImportSummary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  StravaImportDays,
  StravaImportResponse,
  StravaWebhookProcessPendingResponse,
  StravaWebhookRecentEvent,
  StravaWebhookStatusResponse,
  StravaStatusResponse,
  StravaWebhookSubscriptionResponse,
} from "@/types";

type LoadState = "loading" | "ready" | "error";
type WebhookSubscriptionStatus = "unknown" | "active" | "missing" | "error";

const dayOptions: StravaImportDays[] = [7, 14];

function getStatusBadgeClass(isConnected: boolean): string {
  return isConnected
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function getWebhookStatusBadgeClass(
  status: WebhookSubscriptionStatus,
): string {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "missing") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-white text-slate-700";
}

function getWebhookStatusLabel(status: WebhookSubscriptionStatus): string {
  if (status === "active") {
    return "Active";
  }

  if (status === "missing") {
    return "Missing";
  }

  if (status === "error") {
    return "Error";
  }

  return "Unknown";
}

function getAthleteName(status: StravaStatusResponse): string {
  return (
    status.athlete?.displayName ||
    status.athlete?.username ||
    status.athlete?.stravaAthleteId ||
    "Connected athlete"
  );
}

function formatReceivedAt(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function getEventActionLabel(event: StravaWebhookRecentEvent): string {
  return event.actionTaken ?? "Pending";
}

async function fetchStravaStatus(): Promise<StravaStatusResponse> {
  const response = await fetch("/api/strava/status");
  const result = (await response.json()) as StravaStatusResponse;

  if (!response.ok) {
    throw new Error(result.message || "Could not load Strava status.");
  }

  return result;
}

async function fetchStravaWebhookStatus(): Promise<StravaWebhookStatusResponse> {
  const response = await fetch("/api/strava/webhook/status");
  const result = (await response.json()) as StravaWebhookStatusResponse;

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "Could not load Strava webhook status.");
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

async function processPendingStravaWebhookEvents(): Promise<StravaWebhookProcessPendingResponse> {
  const response = await fetch("/api/strava/webhook/process-pending", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      retryFailed: true,
      limit: 10,
    }),
  });
  const result = (await response.json()) as StravaWebhookProcessPendingResponse;

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "Could not process pending webhook events.");
  }

  return result;
}

async function requestStravaWebhookSubscription(input: {
  method: "GET" | "POST" | "DELETE";
  subscriptionId?: string;
}): Promise<StravaWebhookSubscriptionResponse> {
  const response = await fetch("/api/strava/webhook/subscription", {
    method: input.method,
    headers:
      input.method === "DELETE"
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
    body:
      input.method === "DELETE"
        ? JSON.stringify({
            subscriptionId: input.subscriptionId,
            confirmDelete: true,
          })
        : undefined,
  });
  const result = (await response.json()) as StravaWebhookSubscriptionResponse;

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "Could not manage Strava webhook subscription.",
    );
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
  const [webhookSubscription, setWebhookSubscription] =
    useState<StravaWebhookSubscriptionResponse | null>(null);
  const [webhookSubscriptionStatus, setWebhookSubscriptionStatus] =
    useState<WebhookSubscriptionStatus>("unknown");
  const [webhookStatus, setWebhookStatus] =
    useState<StravaWebhookStatusResponse | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isCheckingWebhook, setIsCheckingWebhook] = useState(false);
  const [isCreatingWebhook, setIsCreatingWebhook] = useState(false);
  const [isDeletingWebhook, setIsDeletingWebhook] = useState(false);
  const [isLoadingWebhookStatus, setIsLoadingWebhookStatus] = useState(false);
  const [isProcessingWebhookEvents, setIsProcessingWebhookEvents] =
    useState(false);

  async function loadWebhookStatus(showLoading: boolean) {
    if (showLoading) {
      setIsLoadingWebhookStatus(true);
    }

    try {
      const result = await fetchStravaWebhookStatus();

      setWebhookStatus(result);
    } catch (error) {
      setWebhookMessage(
        error instanceof Error
          ? error.message
          : "Could not load Strava webhook status.",
      );
    } finally {
      if (showLoading) {
        setIsLoadingWebhookStatus(false);
      }
    }
  }

  async function loadStatus(showLoading: boolean) {
    if (showLoading) {
      setLoadState("loading");
    }

    try {
      const result = await fetchStravaStatus();

      setStatus(result);
      setMessage(result.message);
      setLoadState("ready");

      if (result.connected) {
        await loadWebhookStatus(false);
      } else {
        setWebhookStatus(null);
      }
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

        if (result.connected) {
          fetchStravaWebhookStatus()
            .then((webhookResult) => {
              if (!isMounted) {
                return;
              }

              setWebhookStatus(webhookResult);
            })
            .catch((error) => {
              if (!isMounted) {
                return;
              }

              setWebhookMessage(
                error instanceof Error
                  ? error.message
                  : "Could not load Strava webhook status.",
              );
            });
        }
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
      setWebhookSubscription(null);
      setWebhookSubscriptionStatus("unknown");
      setWebhookStatus(null);
      setWebhookMessage(null);
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

  async function handleCheckWebhookSubscription() {
    setIsCheckingWebhook(true);
    setWebhookMessage(null);

    try {
      const result = await requestStravaWebhookSubscription({
        method: "GET",
      });

      setWebhookSubscription(result);
      setWebhookSubscriptionStatus(result.exists ? "active" : "missing");
      setWebhookMessage(result.message);
    } catch (error) {
      setWebhookMessage(
        error instanceof Error
          ? error.message
          : "Could not check Strava webhook subscription.",
      );
      setWebhookSubscriptionStatus("error");
    } finally {
      setIsCheckingWebhook(false);
    }
  }

  async function handleCreateWebhookSubscription() {
    setIsCreatingWebhook(true);
    setWebhookMessage(null);

    try {
      const result = await requestStravaWebhookSubscription({
        method: "POST",
      });

      setWebhookSubscription(result);
      setWebhookSubscriptionStatus(result.exists ? "active" : "missing");
      setWebhookMessage(result.message);
    } catch (error) {
      setWebhookMessage(
        error instanceof Error
          ? error.message
          : "Could not create Strava webhook subscription.",
      );
      setWebhookSubscriptionStatus("error");
    } finally {
      setIsCreatingWebhook(false);
    }
  }

  async function handleDeleteWebhookSubscription() {
    if (!webhookSubscription?.subscriptionId) {
      setWebhookMessage("Check the Strava webhook subscription before deleting it.");
      return;
    }

    const confirmed = window.confirm(
      "Delete the Strava webhook subscription? Automatic Strava webhook messages will stop until you create it again.",
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingWebhook(true);
    setWebhookMessage(null);

    try {
      const result = await requestStravaWebhookSubscription({
        method: "DELETE",
        subscriptionId: webhookSubscription.subscriptionId,
      });

      setWebhookSubscription(result);
      setWebhookSubscriptionStatus(result.exists ? "active" : "missing");
      setWebhookMessage(result.message);
    } catch (error) {
      setWebhookMessage(
        error instanceof Error
          ? error.message
          : "Could not delete Strava webhook subscription.",
      );
      setWebhookSubscriptionStatus("error");
    } finally {
      setIsDeletingWebhook(false);
    }
  }

  async function handleProcessPendingWebhookEvents() {
    setIsProcessingWebhookEvents(true);
    setWebhookMessage(null);

    try {
      const result = await processPendingStravaWebhookEvents();

      setWebhookMessage(
        `${result.message} Processed: ${result.processed}. Imported: ${result.imported}. Skipped: ${result.skipped}. Failed: ${result.failed}.`,
      );
      await loadWebhookStatus(false);
    } catch (error) {
      setWebhookMessage(
        error instanceof Error
          ? error.message
          : "Could not process pending webhook events.",
      );
    } finally {
      setIsProcessingWebhookEvents(false);
    }
  }

  const isConnected = status?.connected === true;
  const isAuthenticated = status?.authenticated === true;
  const isWebhookBusy =
    isCheckingWebhook ||
    isCreatingWebhook ||
    isDeletingWebhook ||
    isLoadingWebhookStatus ||
    isProcessingWebhookEvents;
  const isBusy =
    isConnecting ||
    isImporting ||
    isDisconnecting ||
    isWebhookBusy ||
    loadState === "loading";

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

      {isConnected ? (
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-950">
                Webhook Status
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Automatic import status for Strava webhook messages.
              </p>
            </div>

            <div
              className={`w-fit rounded-md border px-3 py-2 text-sm font-medium ${
                getWebhookStatusBadgeClass(webhookSubscriptionStatus)
              }`}
            >
              Subscription: {getWebhookStatusLabel(webhookSubscriptionStatus)}
            </div>
          </div>

          {webhookMessage ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {webhookMessage}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium uppercase text-slate-500">
                Pending events
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {webhookStatus?.pendingEvents ?? 0}
              </p>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium uppercase text-slate-500">
                Failed events
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {webhookStatus?.failedEvents ?? 0}
              </p>
            </div>
          </div>

          {webhookSubscription?.exists ? (
            <div className="mt-4 space-y-1 text-sm text-slate-700">
              <p>Subscription ID: {webhookSubscription.subscriptionId}</p>
              {webhookSubscription.callbackUrl ? (
                <p className="break-all">
                  Callback URL: {webhookSubscription.callbackUrl}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => void handleCheckWebhookSubscription()}
              disabled={isBusy}
              className="w-fit rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              {isCheckingWebhook
                ? "Checking..."
                : "Check webhook subscription"}
            </button>

            <button
              type="button"
              onClick={() => void handleCreateWebhookSubscription()}
              disabled={isBusy}
              className="w-fit rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isCreatingWebhook
                ? "Creating..."
                : "Create webhook subscription"}
            </button>

            <button
              type="button"
              onClick={() => void handleProcessPendingWebhookEvents()}
              disabled={isBusy}
              className="w-fit rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              {isProcessingWebhookEvents
                ? "Processing..."
                : "Process pending / retry failed"}
            </button>
          </div>

          <div className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-950">
                Recent webhook events
              </p>

              <button
                type="button"
                onClick={() => void loadWebhookStatus(true)}
                disabled={isBusy}
                className="w-fit rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              >
                {isLoadingWebhookStatus ? "Refreshing..." : "Refresh events"}
              </button>
            </div>

            {webhookStatus?.recentEvents.length ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Received</th>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Activity ID</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {webhookStatus.recentEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatReceivedAt(event.receivedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {event.eventType}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {event.objectId}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {event.processingStatus}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {getEventActionLabel(event)}
                        </td>
                        <td className="min-w-40 px-3 py-2">
                          {event.shortError ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                No recent webhook events found.
              </p>
            )}
          </div>

          <details className="mt-5 rounded-md border border-red-100 bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium text-red-700">
              Advanced webhook controls
            </summary>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleDeleteWebhookSubscription()}
                disabled={isBusy || !webhookSubscription?.subscriptionId}
                className="w-fit rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingWebhook
                  ? "Deleting..."
                  : "Delete webhook subscription"}
              </button>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
