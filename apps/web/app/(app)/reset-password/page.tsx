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
  return error instanceof ApiClientError ? error.message : "Có lỗi xảy ra. Thử lại nhé.";
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
        title="Kiểm tra email của bạn"
        body={`Nếu ${email} có tài khoản, link đặt mật khẩu mới đang được gửi tới. Link dùng được một lần, trong một giờ.`}
      />
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    forgot.mutate(email.trim());
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-sm rounded-lg bg-surface-container-low p-lg">
      <h1 className="text-headline-md text-on-surface">Quên mật khẩu?</h1>
      <p className="text-body-md text-on-surface-variant">Nhập email tài khoản, chúng tôi sẽ gửi link để bạn đặt mật khẩu mới.</p>
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
        {forgot.isPending ? "Đang gửi…" : "Gửi link cho tôi"}
      </button>
      <Link href="/login" className="text-center text-body-md font-semibold text-primary hover:underline">
        Quay lại đăng nhập
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
        title="Đã đổi mật khẩu"
        body="Bạn đã được đăng xuất khỏi mọi thiết bị. Đăng nhập bằng mật khẩu mới nhé."
        action={
          <Link href="/login" className={primaryPillClass}>
            Đăng nhập
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
      <h1 className="text-headline-md text-on-surface">Đặt mật khẩu mới</h1>
      <input
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        placeholder="Mật khẩu mới (từ 8 ký tự)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="Nhập lại mật khẩu"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={inputClass}
      />
      {(mismatch || reset.error) && (
        <p role="alert" className="text-body-md text-error">
          {mismatch ? "Hai mật khẩu không khớp." : errorText(reset.error)}
        </p>
      )}
      <button type="submit" disabled={reset.isPending} className={`${primaryPillClass} justify-center disabled:opacity-50`}>
        {reset.isPending ? "Đang lưu…" : "Lưu mật khẩu mới"}
      </button>
      {reset.error instanceof ApiClientError && reset.error.code === "INVALID_LINK" && (
        <Link href="/reset-password" className="text-center text-body-md font-semibold text-primary hover:underline">
          Gửi link mới cho tôi
        </Link>
      )}
    </form>
  );
}
