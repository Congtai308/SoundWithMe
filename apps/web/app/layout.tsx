import type { Metadata, Viewport } from "next";
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
  description: "Âm nhạc kết nối chúng ta, dù bạn ở đâu.",
};

// The browser's own chrome (mobile address bar, overscroll) matches the page.
export const viewport: Viewport = {
  themeColor: "#121318",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${plusJakartaSans.variable} ${spaceGrotesk.variable}`}>
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
        {/* Google's sheet also sets `font-size: 24px` on the icon class, and it
            loads after ours, so it beat every `text-[18px]` on an icon. Imported
            into a cascade layer, it loses to any unlayered rule whatever the
            order; the preload keeps it fetching as early as the plain link did. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link rel="preload" as="style" href={ICON_FONT_URL} />
        {/* Raw, or the server render would escape the URL's quotes and `&`s. */}
        <style dangerouslySetInnerHTML={{ __html: `@import url("${ICON_FONT_URL}") layer(icon-font);` }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
