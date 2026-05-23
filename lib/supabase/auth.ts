import type { User } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export class AuthRequiredError extends Error {
  constructor(message = "Sign in with email before using Run.B*tch.app.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function isAnonymousSupabaseUser(user: User | null): boolean {
  return (user as { is_anonymous?: boolean } | null)?.is_anonymous === true;
}

export async function requireServerUser(
  supabase: SupabaseServerClient,
): Promise<User> {
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  if (error || !user || isAnonymousSupabaseUser(user)) {
    throw new AuthRequiredError();
  }

  return user;
}
