import { NextResponse } from "next/server";
import { getGarminBridgeStatus } from "@/lib/garminBridge/client";
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

  return NextResponse.json(result, { status: 200 });
}
