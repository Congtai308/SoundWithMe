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
        title="Đã xác nhận email"
        body="Cảm ơn bạn! Giờ bạn có thể đặt lại mật khẩu qua email khi cần."
        action={
          <Link href="/" className={primaryPillClass}>
            Bắt đầu nghe
          </Link>
        }
      />
    );
  } else if (!token || verify.isError) {
    panel = (
      <StatePanel
        icon="link_off"
        tone="error"
        title="Link này không dùng được"
        body={
          verify.error instanceof ApiClientError
            ? verify.error.message
            : "Mở link mới nhất trong email, hoặc xin link mới từ thông báo sau khi đăng nhập."
        }
      />
    );
  } else {
    panel = (
      <StatePanel
        icon="mark_email_read"
        title="Xác nhận email"
        body={
          user && !user.isGuest
            ? `Xác nhận ${user.email ?? "địa chỉ này"} là của bạn.`
            : "Nếu đây là tài khoản của bạn, hãy đăng nhập trước rồi mở lại link này. Bạn cũng có thể xác nhận mà không cần đăng nhập."
        }
        action={
          <button
            type="button"
            disabled={verify.isPending}
            onClick={() => verify.mutate(token)}
            className={`${primaryPillClass} disabled:opacity-50`}
          >
            {verify.isPending ? "Đang xác nhận…" : "Xác nhận email"}
          </button>
        }
      />
    );
  }

  return <div className="mx-auto w-full max-w-lg px-md py-xl">{panel}</div>;
}
