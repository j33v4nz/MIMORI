import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { getCachedUser } from "./lib/db/server";
import { AppShell } from "./components/app-shell";
import "./globals.css";
import { computeVigilance } from "./lib/vigilance";
import { getOverviewStats } from "./lib/dashboard/queries";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: "MIMORI | Observability & Security for AI Agents",
  description: "Inspect AI-agent tool activity, flag known security patterns, and compare execution sessions before releasing updates.",
  keywords: ["AI", "Security", "LLM", "Agents", "Observability", "Prompt Injection", "Open Source"],
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/icon.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "MIMORI | Security for AI Agents",
    description: "Open-source observability and threat detection for autonomous AI agents.",
    type: "website",
    siteName: "MIMORI",
    images: [
      {
        url: "/logo.png",
        width: 1536,
        height: 1024,
        alt: "MIMORI Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MIMORI | Observability & Security for AI Agents",
    description: "Open-source behavioral control plane and threat detection for autonomous AI agents.",
    images: ["/logo.png"],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCachedUser();
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "";
  const isAuthPage = pathname.startsWith("/login");
  const showSidebar = !!user && !isAuthPage;
  const disableAuth = process.env.DISABLE_AUTH === "true";

  return (
    <html
      lang="en"
      className={`${inter.variable} light`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,100..900;1,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-background font-body-md overflow-x-hidden antialiased min-h-screen" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase">
          Skip to content
        </a>

        <AppShell
          user={user}
          disableAuth={disableAuth}
          showSidebar={showSidebar}
          vigilanceBadge={
            <Suspense fallback={<div className="font-label-xs text-label-xs text-secondary uppercase">STATUS: INITIALIZING...</div>}>
              <SidebarVigilanceBadge />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

async function SidebarVigilanceBadge() {
  const user = await getCachedUser();
  if (!user) {
    return (
      <p className="font-label-xs text-label-xs text-secondary uppercase">
        VIGILANCE STATUS: OFFLINE
      </p>
    );
  }

  let vigilanceResult = computeVigilance({ critical: 0, high: 0, medium: 0, low: 0 });

  try {
    const stats = await getOverviewStats();
    vigilanceResult = computeVigilance(stats.detections_by_severity_24h);
  } catch (e) {
    if (e instanceof Error && "digest" in e && typeof (e as { digest: string }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw e;
    }
  }

  const { vigilanceDesc } = vigilanceResult;

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="font-label-xs text-label-xs text-secondary uppercase tracking-wider font-bold">
        STATUS: <span className="text-primary">{vigilanceDesc}</span>
      </span>
    </div>
  );
}
