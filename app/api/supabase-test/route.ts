import { NextResponse } from "next/server";
import { testSupabaseConnection } from "@/lib/db/testSupabaseConnection";
import { AuthRequiredError, requireServerUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireServerUser(supabase);
    const result = await testSupabaseConnection({
      supabase,
      userId: user.id,
    });
    const status = result.ok ? 200 : 500;

    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not connect to Supabase.",
      },
      { status: 500 },
    );
  }
}
