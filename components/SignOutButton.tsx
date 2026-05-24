"use client";

import { useEffect, useState } from "react";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    async function checkSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      setIsSignedIn(Boolean(user) && !isAnonymousSupabaseUser(user));
      setIsCheckingSession(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      const user = session?.user ?? null;

      setIsSignedIn(Boolean(user) && !isAnonymousSupabaseUser(user));
      setIsCheckingSession(false);

      if (user) {
        setErrorMessage(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) {
        throw error;
      }

      setIsSignedIn(false);
      window.location.assign("/login");
    } catch {
      setIsSigningOut(false);
      setErrorMessage("Could not sign out. Try again.");
    }
  }

  if (isCheckingSession || !isSignedIn) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSigningOut ? "Signing out..." : "Sign out"}
      </button>
      {errorMessage ? (
        <span role="status" className="text-xs text-red-700">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
