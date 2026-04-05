import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">PvP Index</h1>
          <p className="text-zinc-500 text-sm">Sign in to manage your servers</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <OAuthButtons />
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-zinc-900 px-4 text-zinc-600">or</span>
            </div>
          </div>
          <LoginForm />
        </div>
        <p className="text-center text-xs text-zinc-600 mt-4">
          <Link href="/" className="hover:text-zinc-400">← Back to PvP Index</Link>
        </p>
      </div>
    </div>
  );
}
