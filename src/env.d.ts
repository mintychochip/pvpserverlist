/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/cloudflare" />

interface Env {
  GEMINI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
    };
  }
}
