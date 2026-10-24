import type { ReactNode } from "react";
import { RoomSessionProvider } from "@/features/rooms/components/RoomSessionProvider";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { MobileTabBar } from "./MobileTabBar";
import { Toaster } from "@/components/ui/Toaster";
import { UserRealtime } from "@/features/notifications/components/UserRealtime";
import { VerifyEmailBanner } from "@/features/auth/components/VerifyEmailBanner";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <RoomSessionProvider>
        {/* Keyboard users skip the sidebar and top bar. */}
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-primary-container text-headline-sm text-on-primary-container focus:not-sr-only focus:fixed focus:left-md focus:top-md focus:px-md focus:py-xs"
        >
          Bỏ qua, tới nội dung chính
        </a>
        <Sidebar />
        <TopNav />
        <main id="main" tabIndex={-1} className="min-h-screen outline-none pb-20 pt-16 sm:pb-0 sm:pl-[72px] md:pl-72 rail:pl-[72px] undock:pl-0 md:transition-[padding] md:duration-300 md:ease-out">
          <VerifyEmailBanner />
          {children}
        </main>
        <MobileTabBar />
        <UserRealtime />
        <Toaster />
      </RoomSessionProvider>
    </div>
  );
}
