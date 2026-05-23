import {
  getAuthenticatedUserId,
  getDbClient,
  type UserScopedDbOptions,
} from "@/lib/db/supabaseClient";

export type SupabaseConnectionTestResult = {
  ok: boolean;
  message: string;
};

export async function testSupabaseConnection(
  options?: UserScopedDbOptions,
): Promise<SupabaseConnectionTestResult> {
  try {
    const supabase = getDbClient(options);
    const userId = await getAuthenticatedUserId(options);

    const { error } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (error) {
      return {
        ok: false,
        message: `Supabase connected, but the profiles table check failed: ${error.message}`,
      };
    }

    return {
      ok: true,
      message: "Supabase connected and the profiles table is reachable.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not connect to Supabase.",
    };
  }
}
