import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { FloatingAddServer } from "@/components/ui/FloatingAddServer";
import { AdSenseScript } from "@/components/ads/AdSenseScript";

export const metadata: Metadata = {
  title: "PvP Index — Best Minecraft PvP Servers",
  description: "Find the best Minecraft PvP servers with real-time latency checks, ranked by performance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        {children}
        <AdSenseScript />
        <FloatingAddServer />
      </body>
    </html>
  );
}
