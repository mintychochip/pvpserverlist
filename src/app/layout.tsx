import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { FloatingAddServer } from "@/components/ui/FloatingAddServer";
import { AdSenseScript } from "@/components/ads/AdSenseScript";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

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
      <body className={cn("min-h-screen bg-background font-sans antialiased", geistSans.variable)}>
        {children}
        <AdSenseScript />
        <FloatingAddServer />
      </body>
    </html>
  );
}
