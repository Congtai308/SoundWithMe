"use client";

import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  guestLoginSchema,
  loginSchema,
  registerSchema,
  type GuestLoginInput,
  type LoginInput,
  type RegisterInput,
} from "@soundwithme/validation";
import { ApiClientError } from "@/services/api-client";
import { GoogleIcon, AppleIcon } from "@/components/ui/icons";
import { Icon } from "@/components/ui/Icon";
import { googleLoginUrl } from "../services/auth-api";
import { useGuestLogin, useLogin, useRegister } from "../hooks/use-auth";

export type AuthTab = "login" | "register" | "guest";

const TABS: { id: AuthTab; label: string }[] = [
  { id: "login", label: "Sign In" },
  { id: "register", label: "Create Account" },
  { id: "guest", label: "Fast Pass" },
];

const HEADINGS: Record<AuthTab, { eyebrow: string; title: string }> = {
  login: { eyebrow: "Welcome back", title: "Sign in to your Sonic Identity" },
  register: { eyebrow: "New listener", title: "Create your Sonic Identity" },
  guest: { eyebrow: "No account needed", title: "Jump in with a Fast Pass" },
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
    <div className="flex flex-col rounded-lg bg-surface-container-low p-lg shadow-2xl backdrop-blur-2xl md:col-span-7 md:self-start md:p-xl">
      <div className="flex flex-col justify-between gap-md pb-md sm:flex-row sm:items-center">
        <div>
          <span className="font-technical block text-label-mono-sm uppercase text-primary">
            {heading.eyebrow}
          </span>
          <h1 className="text-[26px] font-bold leading-[34px] tracking-tight text-on-surface sm:text-headline-xl">
            {heading.title}
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Authentication method"
          className="inline-flex self-start rounded-full bg-surface-container p-1 shadow-inner sm:self-auto"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`whitespace-nowrap rounded-full px-sm py-1.5 text-headline-sm transition-all sm:px-md ${
                activeTab === tab.id
                  ? "bg-primary-container text-on-primary-container shadow-md"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== "guest" && (
        <>
          <div className="grid grid-cols-1 gap-sm pb-md pt-xs sm:grid-cols-2">
            <a
              href={googleLoginUrl}
              className="flex items-center justify-center gap-sm rounded-full bg-surface-container px-md py-2.5 text-headline-sm text-on-surface shadow-sm transition-all hover:bg-surface-container-high active:scale-[0.98]"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </a>
            <button
              type="button"
              disabled
              title="Apple sign-in is coming soon"
              className="flex cursor-not-allowed items-center justify-center gap-sm rounded-full bg-surface-container px-md py-2.5 text-headline-sm text-outline opacity-60"
            >
              <AppleIcon className="h-4 w-4" />
              Apple · soon
            </button>
          </div>

          <div className="relative my-xs flex items-center justify-center">
            <div className="h-px w-full bg-surface-container-highest" />
            <span className="font-technical absolute bg-surface-container-low px-sm text-label-mono-sm uppercase text-outline">
              {activeTab === "login" ? "or use your email" : "or configure audio profile"}
            </span>
          </div>
        </>
      )}

      {activeTab === "login" && <LoginForm onSwitchTab={onTabChange} />}
      {activeTab === "register" && <RegisterForm onSwitchTab={onTabChange} />}
      {activeTab === "guest" && <GuestForm onSwitchTab={onTabChange} />}
    </div>
  );
}

function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiClientError ? error.message : "Something went wrong. Try again.";
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
      {trailing && <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
});

const PasswordInput = forwardRef<HTMLInputElement, Omit<IconInputProps, "icon" | "trailing">>(
  function PasswordInput(props, ref) {
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
            aria-label={visible ? "Hide password" : "Show password"}
            className="flex text-outline hover:text-on-surface"
          >
            <Icon name={visible ? "visibility_off" : "visibility"} className="text-[18px]" />
          </button>
        }
        {...props}
      />
    );
  },
);

function SubmitButton({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-xs flex w-full items-center justify-center gap-xs rounded-full bg-primary-container px-md py-sm text-headline-md text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.35)] transition-all hover:shadow-[0_0_32px_rgba(160,120,255,0.5)] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
    >
      {pending ? busy : idle}
      {!pending && <Icon name="arrow_forward" className="text-[20px]" />}
    </button>
  );
}

function SwitchHint({ children }: { children: ReactNode }) {
  return <p className="pt-sm text-center text-body-sm text-on-surface-variant">{children}</p>;
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-primary hover:underline">
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
      className="flex flex-col gap-sm pt-sm"
    >
      <FormError error={login.error} />
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <Field label="Email address" error={errors.email?.message}>
          <IconInput
            icon="mail"
            type="email"
            autoComplete="email"
            placeholder="you@domain.com"
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </Field>
        <Field label="Master key" error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            placeholder="Your password"
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>
      </div>
      <SubmitButton pending={login.isPending} idle="Sign in & tune in" busy="Signing in…" />
      <SwitchHint>
        <Link href="/reset-password" className="font-semibold text-primary hover:underline">
          Forgot your password?
        </Link>
      </SwitchHint>
      <SwitchHint>
        New here? <LinkButton onClick={() => onSwitchTab("register")}>Create an account</LinkButton>{" "}
        or <LinkButton onClick={() => onSwitchTab("guest")}>use a Fast Pass</LinkButton>
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
        <p className="text-headline-sm text-on-surface">Check your email</p>
        <p className="max-w-sm text-body-md text-on-surface-variant">
          We sent a link to <span className="font-semibold text-on-surface">{getValues("email")}</span>. Open it and
          enter your password to finish creating your account. Nothing there? Check spam.
        </p>
        <SwitchHint>
          Wrong address? <LinkButton onClick={() => registerAccount.reset()}>Start over</LinkButton>
        </SwitchHint>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => registerAccount.mutate(data))}
      noValidate
      className="flex flex-col gap-sm pt-sm"
    >
      <FormError error={registerAccount.error} />
      <Field label="Display name" hint="public in rooms" error={errors.displayName?.message}>
        <IconInput
          icon="badge"
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Alex Vance"
          invalid={Boolean(errors.displayName)}
          {...register("displayName")}
        />
      </Field>
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        <Field label="Email address" error={errors.email?.message}>
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
          label="Master key"
          hint={<span className="text-primary-fixed-dim">8+ chars</span>}
          error={errors.password?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="At least 8 characters"
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>
      </div>
      <SubmitButton
        pending={registerAccount.isPending}
        idle="Join the Sonic Circle — Get Started"
        busy="Sending your link…"
      />
      <SwitchHint>
        Already have an account? <LinkButton onClick={() => onSwitchTab("login")}>Sign in</LinkButton>
      </SwitchHint>
    </form>
  );
}

function GuestForm({ onSwitchTab }: { onSwitchTab: (tab: AuthTab) => void }) {
  const router = useRouter();
  const guestLogin = useGuestLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GuestLoginInput>({ resolver: zodResolver(guestLoginSchema) });

  return (
    <form
      onSubmit={handleSubmit((data) =>
        guestLogin.mutate(data, { onSuccess: () => router.push(AFTER_AUTH_PATH) }),
      )}
      noValidate
      className="flex flex-col gap-sm pt-sm"
    >
      <FormError error={guestLogin.error} />
      <p className="text-body-md text-on-surface-variant">
        Pick a name and you&apos;re in. Guest sessions can join and host rooms, but can&apos;t be
        upgraded to a full account later.
      </p>
      <Field label="Display name" hint="public in rooms" error={errors.displayName?.message}>
        <IconInput
          icon="badge"
          type="text"
          autoComplete="nickname"
          placeholder="What should people call you?"
          invalid={Boolean(errors.displayName)}
          {...register("displayName")}
        />
      </Field>
      <SubmitButton pending={guestLogin.isPending} idle="Continue as guest" busy="Joining…" />
      <SwitchHint>
        Want to keep your rooms?{" "}
        <LinkButton onClick={() => onSwitchTab("register")}>Create an account</LinkButton>
      </SwitchHint>
    </form>
  );
}
