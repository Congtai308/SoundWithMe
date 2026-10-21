"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useForgotPassword, useResetPassword } from "@/features/auth/hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";

const inputClass =
  "w-full rounded-lg border border-white/[0.12] bg-surface-container-high px-md py-sm text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";

function errorText(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : "Something went wrong. Try again.";
}

/**
 * Forgotten password, both halves: without a token it asks for the email
 * to send a link to; opened from that link (?token=…) it sets the new one.
 */
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg px-md py-xl">
      {token === undefined ? null : token ? <NewPasswordForm token={token} /> : <RequestLinkForm />}
    </div>
  );
}

function RequestLinkForm() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");

  if (forgot.isSuccess) {
    return (
      <StatePanel
        icon="forward_to_inbox"
        title="Check your email"
        body={`If ${email} has an account, a link to choose a new password is on its way. It works once, for one hour.`}
      />
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    forgot.mutate(email.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-sm rounded-lg bg-surface-container-low p-lg">
      <h1 className="text-headline-md text-on-surface">Forgot your password?</h1>
      <p className="text-body-md text-on-surface-variant">Enter your account&apos;s email and we&apos;ll send you a link to choose a new one.</p>
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@domain.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      {forgot.error && (
        <p role="alert" className="text-body-md text-error">
          {errorText(forgot.error)}
        </p>
      )}
      <button type="submit" disabled={forgot.isPending} className={`${primaryPillClass} justify-center disabled:opacity-50`}>
        {forgot.isPending ? "Sending…" : "Send me a link"}
      </button>
      <Link href="/login" className="text-center text-body-md font-semibold text-primary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  if (reset.isSuccess) {
    return (
      <StatePanel
        icon="lock_reset"
        title="Password changed"
        body="You've been signed out everywhere. Sign in with your new password."
        action={
          <Link href="/login" className={primaryPillClass}>
            Sign in
          </Link>
        }
      />
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    reset.mutate({ token, password });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-sm rounded-lg bg-surface-container-low p-lg">
      <h1 className="text-headline-md text-on-surface">Choose a new password</h1>
      <input
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        placeholder="New password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="The same password again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={inputClass}
      />
      {(mismatch || reset.error) && (
        <p role="alert" className="text-body-md text-error">
          {mismatch ? "The two passwords don't match." : errorText(reset.error)}
        </p>
      )}
      <button type="submit" disabled={reset.isPending} className={`${primaryPillClass} justify-center disabled:opacity-50`}>
        {reset.isPending ? "Saving…" : "Save new password"}
      </button>
      {reset.error instanceof ApiClientError && reset.error.code === "INVALID_LINK" && (
        <Link href="/reset-password" className="text-center text-body-md font-semibold text-primary hover:underline">
          Send me a new link
        </Link>
      )}
    </form>
  );
}
