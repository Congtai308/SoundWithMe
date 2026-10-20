"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useVerifyEmail } from "@/features/auth/hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";

/** Opened from the confirmation email: /verify-email?token=… */
export default function VerifyEmailPage() {
  const verify = useVerifyEmail();
  const [missingToken, setMissingToken] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // The link works once: never send it twice (React dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) verify.mutate(token);
    else setMissingToken(true);
  }, [verify]);

  let panel;
  if (verify.isSuccess) {
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
  } else if (missingToken || verify.isError) {
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
    panel = <StatePanel icon="hourglass_top" title="Confirming your email…" body="One moment." />;
  }

  return <div className="mx-auto w-full max-w-lg px-md py-xl">{panel}</div>;
}
