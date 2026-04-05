// src/components/ui/ContactForm.tsx

"use client";

import { useState } from "react";

export function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    // reCAPTCHA placeholder - replace RECAPTCHA_SITE_KEY with your actual key
    const recaptchaToken = "placeholder-token";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recaptchaToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to send message");
        return;
      }

      setSuccess(true);
      setForm({ name: "", email: "", message: "" });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-8 border-t border-zinc-800">
      <h3 className="text-white font-semibold mb-4">Contact Us</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900/20 border border-green-800 text-green-400 px-4 py-2 rounded-lg text-sm">
            Message sent successfully!
          </div>
        )}

        <div>
          <input
            type="text"
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 text-sm"
          />
        </div>

        <div>
          <input
            type="email"
            required
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 text-sm"
          />
        </div>

        <div>
          <textarea
            rows={3}
            required
            placeholder="Message"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 text-sm resize-none"
          />
        </div>

        {/* reCAPTCHA placeholder */}
        <div className="bg-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-500">
          reCAPTCHA placeholder — replace <code className="text-zinc-400">RECAPTCHA_SITE_KEY</code> with your actual key
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium py-2 rounded-lg transition-colors text-sm"
        >
          {loading ? "Sending..." : "Send Message"}
        </button>
      </form>
    </div>
  );
}
