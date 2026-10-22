"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AuthCard, type AuthTab } from "@/features/auth/components/AuthCard";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import heroImage from "../../../public/images/login-hero.png";

export default function LoginPage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  // The API sends a failed Google sign-in back here with ?error=…
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "google-linked") {
      setGoogleError("Email này đã được liên kết với một tài khoản Google khác.");
    } else if (error === "google") {
      setGoogleError("Đăng nhập Google chưa hoàn tất. Thử lại nhé.");
    }
  }, []);

  return (
    <div className="relative flex min-h-[calc(100vh-10rem)] w-full items-center justify-center overflow-hidden px-md py-xl md:px-[40px]">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-primary-container/20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-10 right-10 h-[460px] w-[460px] rounded-full bg-secondary-container/15 blur-[140px]" />

      <div className="relative z-10 grid w-full max-w-7xl grid-cols-1 gap-xl md:grid-cols-12">
        {googleError && (
          <p role="alert" className="rounded-lg bg-error/10 px-md py-sm text-body-md text-error md:col-span-12">
            {googleError}
          </p>
        )}
        <HeroPanel />
        <AuthCard activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
}

function HeroPanel() {
  return (
    <section className="group relative hidden flex-col justify-between overflow-hidden rounded-lg bg-surface-container-low p-xl shadow-2xl md:col-span-5 md:flex">
      <div className="pointer-events-none absolute -right-24 -top-20 flex h-80 w-80 items-center justify-center rounded-full bg-surface-container-highest/40 opacity-40 transition-transform duration-1000 ease-out group-hover:rotate-45">
        <div className="flex h-64 w-64 items-center justify-center rounded-full bg-surface-container-low">
          <div className="flex h-48 w-48 items-center justify-center rounded-full bg-surface-container-high">
            <Icon name="album" className="text-[32px] text-primary" />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-sm">
        <span className="font-technical flex w-fit items-center gap-1.5 rounded-full bg-primary-container/25 px-xs py-0.5 text-label-mono-sm uppercase text-primary-fixed-dim">
          <span className="h-1.5 w-1.5 rounded-full bg-secondary motion-safe:animate-ping" />
          Nghe nhạc đồng bộ
        </span>
        <div className="pt-md">
          <span className="font-technical mb-2xs block text-label-mono-md uppercase tracking-widest text-secondary">
            Cùng một giai điệu
          </span>
          <h2 className="text-display-hero leading-none text-on-surface">
            Music connects us <span className="text-primary">dù ở đâu</span> you are.
          </h2>
        </div>
      </div>

      <div className="relative z-10 my-lg flex flex-col gap-md">
        <div className="relative overflow-hidden rounded-lg bg-surface-container-high shadow-xl">
          <Image
            src={heroImage}
            alt=""
            priority
            sizes="(min-width: 1024px) 40vw, 0px"
            className="h-56 w-full object-cover opacity-85 transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent" />
          <div className="absolute left-3 top-3 flex items-center gap-xs rounded-full bg-surface-container-lowest/80 px-sm py-1 shadow-lg backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-secondary motion-safe:animate-pulse" />
            <span className="font-technical text-label-mono-sm text-on-surface">PHÒNG ĐỒNG BỘ</span>
          </div>
        </div>

        <div className="flex flex-col gap-xs rounded-lg bg-surface-container-high/60 p-md shadow-inner backdrop-blur-md">
          <div className="flex items-center gap-xs">
            <Icon name="equalizer" className="text-[18px] text-primary" />
            <span className="text-body-sm font-medium text-on-surface-variant">
              Mọi người nghe cùng một khoảnh khắc
            </span>
          </div>
          <svg className="h-10 w-full text-primary" fill="none" preserveAspectRatio="none" viewBox="0 0 360 40" aria-hidden="true">
            <path
              className="opacity-80"
              d="M0 20 Q10 8 20 20 T40 20 T60 5 T80 32 T100 12 T120 28 T140 2 T160 38 T180 18 T200 24 T220 6 T240 34 T260 14 T280 26 T300 10 T320 30 T340 18 L360 20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
            <path
              className="opacity-70"
              d="M0 20 Q15 28 30 20 T60 22 T90 35 T120 10 T150 25 T180 8 T210 32 T240 15 T270 28 T300 12 T330 25 L360 20"
              stroke="#03b5d3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </div>

      <div className="relative z-10 rounded-l-lg bg-gradient-to-r from-primary/30 to-transparent py-xs pl-md">
        <p className="text-body-lg font-light italic text-on-surface">
          &ldquo;A place where music brings people together.&rdquo;
        </p>
        <span className="font-technical mt-1 block text-label-mono-sm uppercase text-outline">
          — SoundWithMe Manifesto
        </span>
      </div>
    </section>
  );
}
