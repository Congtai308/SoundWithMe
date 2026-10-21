"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser, useVerifyEmail } from "@/features/auth/hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";

/**
 * Opened from the confirmation email: /verify-email?token=… The link only
 * counts after a click here, so mail scanners that open links (and run the
 * page) don't confirm addresses for anyone.
 */
export default function VerifyEmailPage() {
  const verify = useVerifyEmail();
  const { data: user } = useCurrentUser();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  let panel;
  if (token === undefined) {
    panel = null;
  } else if (verify.isSuccess) {
    panel = (
      <StatePanel
        icon="verified"
        title="Email confirmed"
        body="Thanks! You can now reset your password by email if you ever need to."
        action={
          <Link href="/" className={primaryPillClass}>
            Start listening
          </Link>
        }
      />
    );
  } else if (!token || verify.isError) {
    panel = (
      <StatePanel
        icon="link_off"
        tone="error"
        title="This link doesn't work"
        body={
          verify.error instanceof ApiClientError
            ? verify.error.message
            : "Open the newest link we emailed you, or ask for a new one from the banner after signing in."
        }
      />
    );
  } else {
    panel = (
      <StatePanel
        icon="mark_email_read"
        title="Confirm your email"
        body={
          user && !user.isGuest
            ? `Confirm that ${user.email ?? "this address"} is yours.`
            : "Sign in first if this is your account, then come back to this link. You can also confirm without signing in."
        }
        action={
          <button
            type="button"
            disabled={verify.isPending}
            onClick={() => verify.mutate(token)}
            className={`${primaryPillClass} disabled:opacity-50`}
          >
            {verify.isPending ? "Confirming…" : "Confirm my email"}
          </button>
        }
      />
    );
  }

  return <div className="mx-auto w-full max-w-lg px-md py-xl">{panel}</div>;
}
