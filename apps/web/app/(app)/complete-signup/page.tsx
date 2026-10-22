"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCompleteSignup } from "@/features/auth/hooks/use-auth";
import { ApiClientError } from "@/services/api-client";
import { StatePanel, primaryPillClass } from "@/components/ui/StatePanel";

const inputClass =
  "w-full rounded-lg border border-white/[0.12] bg-surface-container-high px-md py-sm text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none";

/**
 * Sign-up, step 2: /complete-signup?token=… from the mailed link. Asks for
 * the password chosen in step 1, so only the person who chose it, with the
 * mailbox in hand, can create the account.
 */
export default function CompleteSignupPage() {
  const router = useRouter();
  const complete = useCompleteSignup();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  useEffect(() => {
    if (complete.isSuccess) router.replace("/");
  }, [complete.isSuccess, router]);

  const linkDead = !token || (complete.error instanceof ApiClientError && complete.error.code === "INVALID_LINK");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token && password) complete.mutate({ token, password });
  };

  return (
    <div className="mx-auto w-full max-w-lg px-md py-xl">
      {token === undefined ? null : linkDead ? (
        <StatePanel
          icon="link_off"
          tone="error"
          title="Link này không dùng được"
          body="Link đã hết hạn, đã được dùng, hoặc nhập sai mật khẩu quá nhiều lần. Đăng ký lại để nhận link mới."
          action={
            <Link href="/login" className={primaryPillClass}>
              Quay lại đăng ký
            </Link>
          }
        />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-sm rounded-lg bg-surface-container-low p-lg">
          <h1 className="text-headline-md text-on-surface">Hoàn tất tạo tài khoản</h1>
          <p className="text-body-md text-on-surface-variant">Nhập mật khẩu bạn đã chọn khi đăng ký.</p>
          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Mật khẩu của bạn"
            aria-label="Mật khẩu của bạn"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {complete.error && (
            <p role="alert" className="text-body-md text-error">
              {complete.error instanceof ApiClientError ? complete.error.message : "Có lỗi xảy ra. Thử lại nhé."}
            </p>
          )}
          <button
            type="submit"
            disabled={complete.isPending || complete.isSuccess}
            className={`${primaryPillClass} justify-center disabled:opacity-50`}
          >
            {complete.isPending || complete.isSuccess ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
          </button>
        </form>
      )}
    </div>
  );
}
