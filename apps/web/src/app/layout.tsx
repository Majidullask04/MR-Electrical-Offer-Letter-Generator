import type { Metadata } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";
import "./globals.css";

const outfit = localFont({
  src: "../../public/fonts/Outfit.ttf",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const jakarta = localFont({
  src: "../../public/fonts/PlusJakartaSans.ttf",
  variable: "--font-jakarta",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const jetbrains = localFont({
  src: "../../public/fonts/JetBrainsMono.ttf",
  variable: "--font-jetbrains",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "OfferLater · MR. ELECTRICAL WORKS",
    template: "%s · OfferLater",
  },
  description:
    "Offer letter operations for MR. ELECTRICAL WORKS: drafting, approvals, issuance and a secure candidate response portal.",
  icons: {
    icon: "/brand/mark.svg",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jakarta.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
