"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginStatus =
  | "idle"
  | "sending"
  | "code_sent"
  | "verifying"
  | "signed_in"
  | "error";

type LoginFormProps = {
  initialStatus: LoginStatus;
  initialMessage: string | null;
  nextPath: string;
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500";

export function LoginForm({
  initialStatus,
  initialMessage,
  nextPath,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<LoginStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(initialMessage);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sentEmail) {
      await verifyCode();
      return;
    }

    await sendCode();
  }

  async function sendCode(emailToUse = email) {
    const trimmedEmail = emailToUse.trim();

    if (!trimmedEmail) {
      setStatus("error");
      setMessage("Enter the email address you want to use for this app.");
      return;
    }

    setStatus("sending");
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if ((user as { is_anonymous?: boolean } | null)?.is_anonymous === true) {
        await supabase.auth.signOut();
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
      });

      if (error) {
        throw error;
      }

      setSentEmail(trimmedEmail);
      setCode("");
      setStatus("code_sent");
      setMessage("Code sent. Check your email and enter the code here.");
    } catch {
      setStatus("error");
      setMessage(
        "Could not send the sign-in code. Wait a minute and try again.",
      );
    }
  }

  async function verifyCode() {
    if (!sentEmail) {
      setStatus("error");
      setMessage("Request a sign-in code first.");
      return;
    }

    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setStatus("error");
      setMessage("Enter the code from your email.");
      return;
    }

    setStatus("verifying");
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: sentEmail,
        token: trimmedCode,
        type: "email",
      });

      if (error) {
        throw error;
      }

      setStatus("signed_in");
      setMessage("Signed in. Opening the app...");
      window.location.assign(nextPath);
    } catch {
      setStatus("error");
      setMessage("That code did not work. Check the code or request a new one.");
    }
  }

  async function resendCode() {
    if (!sentEmail) {
      return;
    }

    setSentEmail(null);
    setCode("");
    setStatus("idle");
    setMessage(null);

    await sendCode(sentEmail);
  }

  function useDifferentEmail() {
    setSentEmail(null);
    setCode("");
    setStatus("idle");
    setMessage(null);
  }

  const isBusy =
    status === "sending" || status === "verifying" || status === "signed_in";
  const showingCodeStep = sentEmail !== null;

  return (
    <main className="mx-auto max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use an email one-time code to access your training data.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-800">
          Email
          <input
            className={inputClass}
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="runner@example.com"
            disabled={showingCodeStep || isBusy}
          />
        </label>

        {showingCodeStep ? (
          <label className="block text-sm font-medium text-slate-800">
            One-time code
            <input
              className={inputClass}
              type="text"
              inputMode="numeric"
              value={code}
              autoComplete="one-time-code"
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter the code from your email"
              disabled={isBusy}
            />
          </label>
        ) : null}

        <button
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          type="submit"
          disabled={isBusy}
        >
          {status === "sending"
            ? "Sending..."
            : status === "verifying"
              ? "Checking..."
              : showingCodeStep
                ? "Verify code"
                : "Send code"}
        </button>

        {showingCodeStep ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              className="text-slate-700 underline disabled:text-slate-400"
              type="button"
              onClick={resendCode}
              disabled={isBusy}
            >
              Send a new code
            </button>
            <button
              className="text-slate-700 underline disabled:text-slate-400"
              type="button"
              onClick={useDifferentEmail}
              disabled={isBusy}
            >
              Use a different email
            </button>
          </div>
        ) : null}
      </form>

      {message ? (
        <p
          className={
            status === "error"
              ? "text-sm text-red-700"
              : "text-sm text-slate-700"
          }
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}
