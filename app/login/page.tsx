"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/utils/supabase";

export default function LoginPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseAnonKey ? createClient() : null;

  return (
    <div className="auth-stage">
      <div className="relative w-full max-w-[440px]">
        <section className="rounded-3xl border border-white/10 bg-[#0a0a0a]/90 px-5 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:px-8 sm:py-10">
          <div className="flex flex-col items-center text-center">
            <span
              aria-hidden
              className="h-9 w-6 rounded-[4px] border border-white/80 bg-white/10"
            />
            <h1 className="mt-5 text-[1.75rem] font-medium tracking-tight text-white sm:text-3xl">
              Create with Cut45
            </h1>
          </div>
          <div className="mt-8">
            {supabase ? (
              <Suspense fallback={<p className="text-center text-sm text-white/50">Loading…</p>}>
                <LoginForm supabase={supabase} />
              </Suspense>
            ) : (
              <p role="alert" className="text-center text-sm text-[#ff9b8a]">
                Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to this deployment,
                then redeploy.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
