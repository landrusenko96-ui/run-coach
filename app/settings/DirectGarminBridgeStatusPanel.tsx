"use client";

import { useEffect, useState } from "react";

type GarminBridgeStatusCategory =
  | "AUTHENTICATED"
  | "NOT_AUTHENTICATED"
  | "TOKEN_FILE_MISSING"
  | "TOKEN_EXPIRED_OR_INVALID"
  | "GARMIN_UNREACHABLE"
  | "UNKNOWN_ERROR";

type GarminBridgeClientStatus =
  | "DISABLED"
  | "CONFIG_ERROR"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_UNAUTHORIZED"
  | "BRIDGE_ERROR"
  | GarminBridgeStatusCategory;

type GarminBridgeServerStatus = {
  ok: boolean;
  authenticated: boolean;
  category: GarminBridgeStatusCategory;
  client_library: "python-garminconnect";
  client_version: string | null;
  token_file_exists: boolean;
  token_file_path: string;
  last_auth_check_at: string;
  message: string;
};

type GarminBridgeStatusResult = {
  ok: boolean;
  enabled: boolean;
  status: GarminBridgeClientStatus;
  message: string;
  bridgeStatus: GarminBridgeServerStatus | null;
};

type LoadState = "loading" | "ready" | "error";

const bridgeStartCommand =
  "cd local-garmin-bridge && source .venv/bin/activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8765";

function getBadgeClass(isGood: boolean | null): string {
  if (isGood === null) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return isGood
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function getConfiguredStatus(status: GarminBridgeStatusResult | null): {
  label: string;
  isGood: boolean | null;
} {
  if (!status) {
    return {
      label: "Checking",
      isGood: null,
    };
  }

  if (!status || status.status === "DISABLED" || status.status === "CONFIG_ERROR") {
    return {
      label: "Not configured",
      isGood: false,
    };
  }

  return {
    label: "Configured",
    isGood: true,
  };
}

function getReachableStatus(status: GarminBridgeStatusResult | null): {
  label: string;
  isGood: boolean | null;
} {
  if (!status) {
    return {
      label: "Checking",
      isGood: null,
    };
  }

  if (status.status === "DISABLED" || status.status === "CONFIG_ERROR") {
    return {
      label: "Not checked",
      isGood: null,
    };
  }

  if (status.status === "BRIDGE_UNAVAILABLE") {
    return {
      label: "Not reachable",
      isGood: false,
    };
  }

  return {
    label: "Reachable",
    isGood: true,
  };
}

function getAuthenticatedStatus(status: GarminBridgeStatusResult | null): {
  label: string;
  isGood: boolean | null;
} {
  if (!status) {
    return {
      label: "Checking",
      isGood: null,
    };
  }

  if (!status.bridgeStatus) {
    return {
      label: "Not checked",
      isGood: null,
    };
  }

  return {
    label: status.bridgeStatus.authenticated
      ? "Authenticated"
      : "Not authenticated",
    isGood: status.bridgeStatus.authenticated,
  };
}

function getLastError(status: GarminBridgeStatusResult | null): string | null {
  if (!status) {
    return null;
  }

  if (status.ok && status.bridgeStatus?.authenticated) {
    return null;
  }

  return status.message;
}

function getSuggestedFixes(status: GarminBridgeStatusResult | null): string[] {
  if (!status) {
    return [];
  }

  if (status.status === "DISABLED" || status.status === "CONFIG_ERROR") {
    return [
      "On Vercel, leave Direct Garmin bridge variables unset and use Intervals.icu export. For local testing only, set GARMIN_BRIDGE_URL and GARMIN_BRIDGE_API_KEY in .env.local.",
    ];
  }

  if (status.status === "BRIDGE_UNAVAILABLE") {
    return [`Start local bridge: ${bridgeStartCommand}`];
  }

  if (
    status.bridgeStatus?.category === "TOKEN_FILE_MISSING" ||
    status.bridgeStatus?.category === "NOT_AUTHENTICATED"
  ) {
    return ["Run the Garmin auth helper in local-garmin-bridge."];
  }

  if (status.bridgeStatus?.category === "TOKEN_EXPIRED_OR_INVALID") {
    return ["Re-authenticate with Garmin."];
  }

  if (status.status === "BRIDGE_UNAUTHORIZED") {
    return [
      "Check that GARMIN_BRIDGE_API_KEY in .env.local matches the key used to start the bridge.",
    ];
  }

  if (status.bridgeStatus?.category === "GARMIN_UNREACHABLE") {
    return ["Check your internet connection, then refresh this status."];
  }

  return [];
}

function StatusBadge({
  label,
  value,
  isGood,
}: {
  label: string;
  value: string;
  isGood: boolean | null;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${getBadgeClass(isGood)}`}>
      <span className="block text-xs font-medium uppercase tracking-normal text-current">
        {label}
      </span>
      <span className="mt-1 block font-medium">{value}</span>
    </div>
  );
}

async function requestGarminBridgeStatus(): Promise<{
  loadState: LoadState;
  status: GarminBridgeStatusResult;
}> {
  try {
    const response = await fetch("/api/garmin/status");
    const result = (await response.json()) as GarminBridgeStatusResult;

    return {
      loadState: "ready",
      status: result,
    };
  } catch {
    return {
      loadState: "error",
      status: {
        ok: false,
        enabled: true,
        status: "BRIDGE_UNAVAILABLE",
        message: "Local Garmin bridge is not running.",
        bridgeStatus: null,
      },
    };
  }
}

export function DirectGarminBridgeStatusPanel() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [status, setStatus] = useState<GarminBridgeStatusResult | null>(null);

  async function loadStatus(showLoading: boolean) {
    if (showLoading) {
      setLoadState("loading");
    }

    const result = await requestGarminBridgeStatus();

    setStatus(result.status);
    setLoadState(result.loadState);
  }

  useEffect(() => {
    let isMounted = true;

    requestGarminBridgeStatus().then((result) => {
      if (!isMounted) {
        return;
      }

      setStatus(result.status);
      setLoadState(result.loadState);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const configured = getConfiguredStatus(status);
  const reachable = getReachableStatus(status);
  const authenticated = getAuthenticatedStatus(status);
  const clientVersion = status?.bridgeStatus?.client_version ?? "Not available";
  const lastError = getLastError(status);
  const suggestedFixes = getSuggestedFixes(status);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-medium text-slate-950">
            Direct Garmin Bridge
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Local-only experimental Garmin export status. This panel checks the
            Next.js server route, not the bridge directly from your browser. In
            hosted production, Direct Garmin is expected to be unavailable.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStatus(true)}
          disabled={loadState === "loading"}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        >
          {loadState === "loading" ? "Checking..." : "Refresh status"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusBadge
          label="Configuration"
          value={configured.label}
          isGood={configured.isGood}
        />
        <StatusBadge
          label="Bridge"
          value={reachable.label}
          isGood={reachable.isGood}
        />
        <StatusBadge
          label="Garmin auth"
          value={authenticated.label}
          isGood={authenticated.isGood}
        />
        <StatusBadge
          label="Client version"
          value={clientVersion}
          isGood={status?.bridgeStatus?.client_version ? true : null}
        />
      </div>

      {loadState === "loading" && !status ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
          Checking bridge status...
        </div>
      ) : lastError ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <span className="font-medium">Last issue:</span> {lastError}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          Direct Garmin bridge is reachable and authenticated.
        </div>
      )}

      {suggestedFixes.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-medium text-slate-900">
            Suggested fix
          </h3>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {suggestedFixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
