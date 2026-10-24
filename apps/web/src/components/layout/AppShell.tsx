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
        <Sidebar />
        <TopNav />
        <main className="min-h-screen pb-20 pt-16 sm:pb-0 sm:pl-[72px] md:pl-72 rail:pl-[72px] undock:pl-0 md:transition-[padding] md:duration-300 md:ease-out">
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
