"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@soundwithme/validation";
import { ApiClientError } from "@/services/api-client";
import { GoogleIcon } from "@/components/ui/icons";
import { Icon } from "@/components/ui/Icon";
import { googleLoginUrl } from "../services/auth-api";
import { useLogin, useRegister } from "../hooks/use-auth";

// Visitors who just want to listen get a guest account by opening a room; this page is for accounts.
export type AuthTab = "login" | "register";

const TABS: { id: AuthTab; label: string }[] = [
  { id: "login", label: "Đăng nhập" },
  { id: "register", label: "Tạo tài khoản" },
];

const HEADINGS: Record<AuthTab, { eyebrow: string; title: string; lead: string }> = {
  login: {
    eyebrow: "Chào mừng trở lại",
    title: "Đăng nhập",
    lead: "Vào lại phòng của bạn, bạn bè và thư viện nhạc.",
  },
  register: {
    eyebrow: "Người nghe mới",
    title: "Tạo tài khoản",
    lead: "Giữ phòng, danh sách phát và bạn bè của bạn ở một nơi.",
  },
};

const AFTER_AUTH_PATH = "/";

export function AuthCard({
  activeTab,
  onTabChange,
}: {
  activeTab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
}) {
  const heading = HEADINGS[activeTab];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-lg">
      <div className="flex flex-col gap-2xs">
        <span className="font-technical text-label-mono-sm uppercase tracking-widest text-primary">
          {heading.eyebrow}
        </span>
        <h1 className="text-headline-xl text-on-surface">{heading.title}</h1>
        <p className="text-body-md text-on-surface-variant">{heading.lead}</p>
      </div>

      <div
        role="tablist"
        aria-label="Đăng nhập hoặc tạo tài khoản"
        className="grid grid-cols-2 rounded-full bg-surface-container p-1 shadow-inner"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`rounded-full px-sm py-2 text-headline-sm transition-colors ${
              activeTab === tab.id
                ? "bg-primary-container text-on-primary-container shadow-md"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <a
        href={googleLoginUrl}
        className="flex items-center justify-center gap-sm rounded-full border border-white/[0.1] bg-white/[0.04] px-md py-3 text-headline-sm text-on-surface transition-[background-color,border-color,transform] hover:border-white/[0.2] hover:bg-white/[0.08] active:scale-[0.98]"
      >
        <GoogleIcon className="h-5 w-5" />
        Tiếp tục với Google
      </a>

      <div className="flex items-center gap-sm" aria-hidden="true">
        <span className="h-px flex-1 bg-white/[0.08]" />
        <span className="font-technical text-label-mono-sm uppercase text-outline">
          hoặc dùng email
        </span>
        <span className="h-px flex-1 bg-white/[0.08]" />
      </div>

      {activeTab === "login" ? (
        <LoginForm onSwitchTab={onTabChange} />
      ) : (
        <RegisterForm onSwitchTab={onTabChange} />
      )}
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiClientError ? error.message : "Có lỗi xảy ra. Thử lại nhé.";
  return (
    <div
      role="alert"
      className="flex items-center gap-xs rounded-md bg-error-container/40 px-md py-sm text-body-sm text-on-error-container"
    >
      <Icon name="error" className="text-[18px]" />
      {message}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-technical flex items-center justify-between text-label-mono-sm uppercase text-on-surface-variant">
        <span>{label}</span>
        {hint && <span className="normal-case text-outline">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-body-sm text-error">{error}</span>}
    </label>
  );
}

interface IconInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon: string;
  invalid?: boolean;
  trailing?: ReactNode;
}

const IconInput = forwardRef<HTMLInputElement, IconInputProps>(function IconInput(
  { icon, invalid = false, trailing, ...props },
  ref,
) {
  return (
    <div className="relative">
      <Icon
        name={icon}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-outline"
      />
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        {...props}
        className={`w-full rounded-md bg-surface-container py-2.5 pl-10 text-body-md text-on-surface shadow-inner transition-colors placeholder:text-outline focus:bg-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary-container ${
          trailing ? "pr-10" : "pr-md"
        } ${invalid ? "ring-1 ring-error" : ""}`}
      />
      {trailing && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
      )}
    </div>
  );
});

const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<IconInputProps, "icon" | "trailing">
>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <IconInput
      ref={ref}
      icon="lock"
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          className="flex text-outline hover:text-on-surface"
        >
          <Icon
            name={visible ? "visibility_off" : "visibility"}
            className="text-[18px]"
          />
        </button>
      }
      {...props}
    />
  );
});

function SubmitButton({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-xs flex w-full items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm text-headline-md text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-[color,background-color,border-color,box-shadow,transform,opacity,width] hover:shadow-[0_0_32px_rgba(160,120,255,0.5)] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
    >
      {pending ? busy : idle}
      {!pending && <Icon name="arrow_forward" className="text-[20px]" />}
    </button>
  );
}

function SwitchHint({ children }: { children: ReactNode }) {
  return (
    <p className="pt-sm text-center text-body-sm text-on-surface-variant">{children}</p>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold text-primary hover:underline"
    >
      {children}
    </button>
  );
}

function LoginForm({ onSwitchTab }: { onSwitchTab: (tab: AuthTab) => void }) {
  const router = useRouter();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      onSubmit={handleSubmit((data) =>
        login.mutate(data, { onSuccess: () => router.push(AFTER_AUTH_PATH) }),
      )}
      noValidate
      className="flex flex-col gap-md"
    >
      <FormError error={login.error} />
      <Field label="Địa chỉ email" error={errors.email?.message}>
        <IconInput
          icon="mail"
          type="email"
          autoComplete="email"
          placeholder="you@domain.com"
          invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>
      <Field
        label="Mật khẩu"
        hint={
          <Link
            href="/reset-password"
            className="font-semibold text-primary hover:underline"
          >
            Quên mật khẩu?
          </Link>
        }
        error={errors.password?.message}
      >
        <PasswordInput
          autoComplete="current-password"
          placeholder="Mật khẩu của bạn"
          invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>
      <SubmitButton pending={login.isPending} idle="Đăng nhập" busy="Đang đăng nhập…" />
      <SwitchHint>
        Chưa có tài khoản?{" "}
        <LinkButton onClick={() => onSwitchTab("register")}>Tạo tài khoản</LinkButton>
      </SwitchHint>
    </form>
  );
}

function RegisterForm({ onSwitchTab }: { onSwitchTab: (tab: AuthTab) => void }) {
  const registerAccount = useRegister();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  if (registerAccount.isSuccess) {
    return (
      <div role="status" className="flex flex-col items-center gap-sm pt-md text-center">
        <Icon name="forward_to_inbox" className="text-[40px] text-primary" />
        <p className="text-headline-sm text-on-surface">Kiểm tra email của bạn</p>
        <p className="max-w-sm text-body-md text-on-surface-variant">
          Chúng tôi đã gửi link tới{" "}
          <span className="font-semibold text-on-surface">{getValues("email")}</span>. Mở
          link và nhập mật khẩu để hoàn tất tài khoản. Không thấy thư? Xem trong mục Spam.
        </p>
        <SwitchHint>
          Nhập nhầm email?{" "}
          <LinkButton onClick={() => registerAccount.reset()}>Làm lại</LinkButton>
        </SwitchHint>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => registerAccount.mutate(data))}
      noValidate
      className="flex flex-col gap-md"
    >
      <FormError error={registerAccount.error} />
      <Field
        label="Tên hiển thị"
        hint="mọi người trong phòng sẽ thấy"
        error={errors.displayName?.message}
      >
        <IconInput
          icon="badge"
          type="text"
          autoComplete="nickname"
          placeholder="VD: Minh Anh"
          invalid={Boolean(errors.displayName)}
          {...register("displayName")}
        />
      </Field>
      <Field label="Địa chỉ email" error={errors.email?.message}>
        <IconInput
          icon="mail"
          type="email"
          autoComplete="email"
          placeholder="you@domain.com"
          invalid={Boolean(errors.email)}
          {...register("email")}
        />
      </Field>
      <Field
        label="Mật khẩu"
        hint={<span className="text-primary-fixed-dim">từ 8 ký tự</span>}
        error={errors.password?.message}
      >
        <PasswordInput
          autoComplete="new-password"
          placeholder="Ít nhất 8 ký tự"
          invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>
      <SubmitButton
        pending={registerAccount.isPending}
        idle="Tạo tài khoản"
        busy="Đang gửi link…"
      />
      <SwitchHint>
        Đã có tài khoản?{" "}
        <LinkButton onClick={() => onSwitchTab("login")}>Đăng nhập</LinkButton>
      </SwitchHint>
    </form>
  );
}
