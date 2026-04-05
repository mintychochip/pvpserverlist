// src/app/submit/page.tsx

import Link from "next/link";
import { Metadata } from "next";
import { SubmitForm } from "@/components/submit/SubmitForm";
import { AdBanner } from "@/components/ads/AdBanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit Server — PvP Index",
  description: "Submit your Minecraft server to PvP Index.",
};

export default function SubmitPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 py-4">
        <div className="max-w-4xl mx-auto px-4">
          <Link href="/" className="text-sm text-zinc-500 hover:text-white transition-colors">
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Submit Your Server</h1>
        <p className="text-zinc-400 mb-6">Add your server to the PvP Index directory.</p>
        <SubmitForm />

        <div className="mt-8">
          <AdBanner slot="footer" />
        </div>
      </main>
    </div>
  );
}
