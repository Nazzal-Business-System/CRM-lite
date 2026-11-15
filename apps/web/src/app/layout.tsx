import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/providers/app-providers";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NBS CRM",
    template: "%s · NBS CRM",
  },
  description: "Internal CRM for Nazzal Business System.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full"
    >
      <head>
        <link rel="preload" href="/fonts/22a5144ee8d83bca-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/>
        <link rel="preload" href="/fonts/7d4881bb7e1bf84d-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/>
        <link rel="preload" href="/fonts/b261c59b2d76913d-s.p.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/>
      </head>
      <body className="min-h-full font-sans antialiased">
        <AppProviders>{children}</AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
