"use client";

import { Suspense, useEffect } from "react";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/utils/supabase";

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = open && supabaseUrl && supabaseAnonKey ? createClient() : null;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close sign in"
        className="absolute inset-0 bg-black/70 backdrop-blur"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900/80 px-5 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur sm:px-8 sm:py-10"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full border border-gray-800 text-sm text-white"
        >
          X
        </button>
        <div className="flex flex-col items-center text-center">
          <span aria-hidden className="h-9 w-6 rounded-[4px] border border-white/80 bg-white/10" />
          <h2 id="auth-modal-title" className="mt-5 text-[1.75rem] font-medium tracking-tight text-white">
            Create with Cut45
          </h2>
          <p className="mt-2 text-sm text-zinc-400">Sign in to continue, or create an account.</p>
        </div>
        <div className="mt-8">
          {supabase ? (
            <Suspense fallback={<p className="text-center text-sm text-zinc-400">Loading…</p>}>
              <LoginForm supabase={supabase} />
            </Suspense>
          ) : (
            <p role="alert" className="text-center text-sm text-[#ff9b8a]">
              Sign-in is not configured on this deployment yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
