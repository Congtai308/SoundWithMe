import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/providers/app-providers";
import { SIDEBAR_INIT_SCRIPT } from "@/components/layout/sidebar-store";
import { ICON_FONT_URL } from "@/components/ui/icon-names";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SoundWithMe",
  description: "Music connects us wherever you are.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_INIT_SCRIPT }} />
        {/* Icon font used throughout the Stitch designs, cut down to the icons
            the app uses (see icon-names.ts). display=block avoids flashing
            ligature names ("play_arrow") before the font loads, and the root
            App Router layout already applies it to every page. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Song artwork: connect while the page's scripts are still loading. */}
        <link rel="preconnect" href="https://i.ytimg.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link rel="stylesheet" href={ICON_FONT_URL} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
