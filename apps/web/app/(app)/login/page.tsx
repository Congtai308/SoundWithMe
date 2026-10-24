"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AuthCard, type AuthTab } from "@/features/auth/components/AuthCard";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import heroImage from "../../../public/images/login-hero.png";

const HIGHLIGHTS: { icon: string; text: string }[] = [
  { icon: "headphones", text: "Nghe cùng một khoảnh khắc, dù mỗi người một nơi" },
  { icon: "forum", text: "Chat và thả cảm xúc ngay trong phòng" },
  { icon: "mic", text: "Cầm mic hát karaoke cùng bạn bè" },
];

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
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden px-md py-lg md:px-[40px] md:py-xl">
      <div className="pointer-events-none absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-primary-container/15 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-20 right-0 h-[460px] w-[460px] rounded-full bg-secondary-container/10 blur-[140px]" />

      <div className="relative z-10 grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-[28px] border border-white/[0.07] bg-surface-container-lowest/60 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] md:grid-cols-[1.1fr_1fr]">
        <HeroPanel />
        <div className="flex flex-col justify-center p-lg sm:p-xl md:p-2xl">
          {googleError && (
            <p
              role="alert"
              className="mb-md flex items-center gap-xs rounded-md bg-error-container/40 px-md py-sm text-body-sm text-on-error-container"
            >
              <Icon name="error" className="text-[18px]" />
              {googleError}
            </p>
          )}
          <AuthCard activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>
    </div>
  );
}

/** The listening room at night: the artwork fills the panel, the pitch sits on its darkest part. */
function HeroPanel() {
  return (
    <section className="relative h-48 overflow-hidden sm:h-60 md:h-auto md:min-h-[620px]">
      <Image
        src={heroImage}
        alt=""
        priority
        fill
        sizes="(min-width: 1024px) 560px, 100vw"
        className="object-cover object-[70%_center] md:object-[62%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/55 to-transparent md:via-surface-container-lowest/35" />
      <div className="absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-l from-surface-container-lowest/80 to-transparent md:block" />

      <span className="font-technical absolute left-md top-md flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/45 px-sm py-1 text-label-mono-sm uppercase text-on-surface backdrop-blur-md md:left-lg md:top-lg">
        <span className="h-2 w-2 rounded-full bg-secondary motion-safe:animate-pulse" />
        Đang phát cùng nhau
      </span>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-md p-md md:p-xl">
        <h2 className="max-w-md text-[28px] font-bold leading-[34px] tracking-tight text-on-surface md:text-display-hero">
          Âm nhạc kết nối chúng ta, <span className="text-primary">dù bạn ở đâu.</span>
        </h2>
        <ul className="hidden flex-col gap-sm md:flex">
          {HIGHLIGHTS.map((item) => (
            <li
              key={item.icon}
              className="flex items-center gap-sm text-body-md text-on-surface-variant"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-primary">
                <Icon name={item.icon} className="text-[18px]" />
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
