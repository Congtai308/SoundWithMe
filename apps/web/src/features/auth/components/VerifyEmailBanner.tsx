"use client";

import { useCurrentUser, useResendVerification } from "../hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { Icon } from "@/components/ui/Icon";

/** Asks email accounts to confirm their address (needed for password reset). Hidden once confirmed. */
export function VerifyEmailBanner() {
  const { data: user } = useCurrentUser();
  const resend = useResendVerification();
  if (!user || user.isGuest || !user.email || user.emailVerified) return null;

  const failed = resend.error instanceof ApiClientError ? resend.error.message : resend.error ? "Couldn't send it. Try again." : null;

  return (
    <div className="mx-md mt-sm flex flex-wrap items-center gap-xs rounded-lg bg-primary-container/15 px-md py-sm text-body-md text-on-surface md:mx-lg">
      <Icon name="mark_email_unread" className="text-[20px] text-primary" />
      <span className="min-w-0 flex-1">
        Confirm <span className="font-semibold">{user.email}</span> so you can get back in if you forget your password.
      </span>
      {resend.isSuccess ? (
        <span className="text-on-surface-variant">Sent. Check your inbox (and spam).</span>
      ) : (
        <button
          type="button"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
          className="font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {resend.isPending ? "Sending…" : "Send the link again"}
        </button>
      )}
      {failed && (
        <span role="alert" className="w-full text-error">
          {failed}
        </span>
      )}
    </div>
  );
}
