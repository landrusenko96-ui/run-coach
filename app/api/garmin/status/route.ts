import { NextResponse } from "next/server";
import {
  getGarminBridgeStatus,
  type GarminBridgeStatusResult,
} from "@/lib/garminBridge/client";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  try {
    await requireServerUser(supabase);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          enabled: false,
          status: "DISABLED",
          message: error.message,
          bridgeStatus: null,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        enabled: false,
        status: "CONFIG_ERROR",
        message: "Could not check your sign-in session.",
        bridgeStatus: null,
      },
      { status: 500 },
    );
  }

  const result = await getGarminBridgeStatus();

  return NextResponse.json(sanitizeGarminBridgeStatusResult(result), { status: 200 });
}

function sanitizeGarminBridgeStatusResult(
  result: GarminBridgeStatusResult,
): GarminBridgeStatusResult {
  if (!result.bridgeStatus) {
    return result;
  }

  return {
    ...result,
    bridgeStatus: {
      ok: result.bridgeStatus.ok,
      authenticated: result.bridgeStatus.authenticated,
      category: result.bridgeStatus.category,
      client_library: result.bridgeStatus.client_library,
      client_version: result.bridgeStatus.client_version,
      token_file_exists: result.bridgeStatus.token_file_exists,
      last_auth_check_at: result.bridgeStatus.last_auth_check_at,
      message: result.bridgeStatus.message,
    },
  };
}
