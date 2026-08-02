import type { Metadata, Viewport } from "next";
import { Cinzel, Epilogue, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  variable: "--font-display",
  display: "swap",
});

// Landing-page-only fonts (see app/landing.css) — self-hosted at build time
// via next/font instead of a Google Fonts <link>, so the page needs no
// external network request and stays inside the app's script/style CSP.
const epilogue = Epilogue({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-epilogue",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Paragon Online — 2D Martial Arts MMO",
  description:
    "A browser-based 2D martial arts brawler MMO. Hunt mobs, earn experience, master techniques.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0d12",
  // Lets content (the touch controls' env(safe-area-inset-*) offsets, see
  // .touch-pad/.touch-buttons in globals.css) draw under a notch/home
  // indicator instead of being letterboxed away from it on iOS.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${epilogue.variable} ${jetbrainsMono.variable} ${hankenGrotesk.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
