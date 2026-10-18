"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Provider, Session, SupabaseClient } from "@supabase/supabase-js";
import { Eye, EyeOff } from "lucide-react";
import { useCredits } from "@/components/credit-provider";
import { authServiceMessage, normalizeEmail, validateEmail, validatePassword } from "@/lib/auth";
import { loginDestination } from "@/lib/billing";
import { authRedirectUrl } from "@/lib/site";

type Mode = "create" | "sign-in";

function Field({
  id,
  label,
  type,
  value,
  autoComplete,
  autoCapitalize,
  inputMode,
  error,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  autoComplete: string;
  autoCapitalize?: string;
  inputMode?: "email" | "text";
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-2 block text-sm text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 text-base text-zinc-100 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-[#ff9b8a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

async function storeServerSession(session: Session) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    }),
  });
  if (!response.ok) {
    throw new Error("Could not save the session.");
  }
}

async function createProfile(accessToken: string) {
  try {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await response.json().catch(() => null)) as {
      tokens?: number;
    } | null;
    return typeof payload?.tokens === "number" ? payload.tokens : null;
  } catch {
    return null;
  }
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.14H12v4.05h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.43Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.9A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.52H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.48l3.35-2.58Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.06 7.52l3.35 2.58C7.2 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-white">
      <path d="M14.5 8.5V6.7c0-.7.5-1 1.2-1h1.3V3h-2.2C11.9 3 11 4.6 11 6.5v2H9v2.7h2V21h3.5v-9.8h2.3l.3-2.7h-2.6Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-white">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

const VERIFY_NOTICE = "Check your email inbox for the verification link.";

function openStudio(path: string) {
  window.location.assign(path);
}

export function LoginForm({ supabase }: { supabase: SupabaseClient }) {
  const searchParams = useSearchParams();
  const { setAccountBalance } = useCredits();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const oauthCode = searchParams.get("code");
  const verifyType = searchParams.get("type");
  const awaitingVerification =
    Boolean(oauthCode || searchParams.get("token_hash")) ||
    verifyType === "signup" ||
    verifyType === "email";
  const nextPath = searchParams.get("next");
  const redirectPath = searchParams.get("redirect");
  const plan = searchParams.get("plan");
  const afterAuth = loginDestination({ next: nextPath, redirect: redirectPath, plan });
  const providerError = searchParams.get("error_description");

  useEffect(() => {
    if (!awaitingVerification) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" || !session) return;
      void (async () => {
        try {
          await storeServerSession(session);
          const tokens = await createProfile(session.access_token);
          if (typeof tokens === "number") setAccountBalance(tokens);
          openStudio(afterAuth);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          setFormError(message || "Could not save the session.");
          setPending(false);
        }
      })();
    });
    return () => subscription.unsubscribe();
  }, [afterAuth, awaitingVerification, setAccountBalance, supabase]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setFormError(null);
    setNotice(null);
    setFirstNameError(null);
    setLastNameError(null);
    setEmailError(null);
    setPasswordError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = normalizeEmail(email);
    const nextEmailError = validateEmail(nextEmail);
    const nextPasswordError = validatePassword(password);
    const nextFirstNameError =
      mode === "create" && !firstName.trim() ? "Enter your first name." : null;
    const nextLastNameError =
      mode === "create" && !lastName.trim() ? "Enter your last name." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFirstNameError(nextFirstNameError);
    setLastNameError(nextLastNameError);
    setFormError(null);
    setNotice(null);
    if (nextEmailError || nextPasswordError || nextFirstNameError || nextLastNameError) return;

    setPending(true);
    try {
      if (mode === "create") {
        const { data, error } = await supabase.auth.signUp({
          email: nextEmail,
          password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            },
          },
        });
        if (error) {
          setFormError(authServiceMessage(error.message, mode));
          return;
        }
        if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
          setFormError("An account with that email already exists.");
          return;
        }
        if (!data.session) {
          await fetch("/api/auth/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: nextEmail }),
          }).catch(() => undefined);
          setNotice(VERIFY_NOTICE);
          return;
        }
        await storeServerSession(data.session);
        const tokens = await createProfile(data.session.access_token);
        if (typeof tokens === "number") setAccountBalance(tokens);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: nextEmail,
          password,
        });
        if (error || !data.session) {
          setFormError(authServiceMessage(error?.message ?? "Could not sign in.", mode));
          return;
        }
        await storeServerSession(data.session);
        const tokens = await createProfile(data.session.access_token);
        if (typeof tokens === "number") setAccountBalance(tokens);
      }

      openStudio(afterAuth);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(message || "Could not reach the account service.");
    } finally {
      setPending(false);
    }
  }

  async function continueWithGoogle() {
    setFormError(null);
    setNotice(null);
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setFormError(authServiceMessage(error.message, mode));
        setPending(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(message || "Could not reach the account service.");
      setPending(false);
    }
  }

  async function continueWithFacebook() {
    setFormError(null);
    setNotice(null);
    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "facebook",
        options: {
          scopes: "email public_profile",
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setFormError(authServiceMessage(error.message, mode));
        setPending(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(message || "Could not reach the account service.");
      setPending(false);
    }
  }

  async function continueWith(provider: Provider) {
    setFormError(null);
    setNotice(null);
    setPending(true);
    try {
      const redirectTo = new URL(authRedirectUrl());
      if (nextPath) redirectTo.searchParams.set("next", nextPath);
      if (redirectPath) redirectTo.searchParams.set("redirect", redirectPath);
      if (plan) redirectTo.searchParams.set("plan", plan);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectTo.toString(),
          scopes: provider === "apple" ? "name email" : undefined,
        },
      });
      if (error) {
        setFormError(authServiceMessage(error.message, mode));
        setPending(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setFormError(message || "Could not reach the account service.");
      setPending(false);
    }
  }

  const alertMessage = formError ?? providerError;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "create" ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          <Field
            id="first-name"
            label="First name"
            type="text"
            value={firstName}
            autoComplete="given-name"
            autoCapitalize="words"
            error={firstNameError}
            onChange={(value) => {
              setFirstName(value);
              setFirstNameError(null);
            }}
          />
          <Field
            id="last-name"
            label="Last name"
            type="text"
            value={lastName}
            autoComplete="family-name"
            autoCapitalize="words"
            error={lastNameError}
            onChange={(value) => {
              setLastName(value);
              setLastNameError(null);
            }}
          />
        </div>
      ) : null}

      <Field
        id="email"
        label="Email address"
        type="email"
        value={email}
        autoComplete="email"
        autoCapitalize="none"
        inputMode="email"
        error={emailError}
        onChange={(value) => {
          setEmail(value);
          setEmailError(null);
        }}
      />
      <div>
        <label htmlFor="password" className="mb-2 block text-sm text-zinc-400">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError(null);
            }}
            className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 pr-12 text-base text-zinc-100 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 transition hover:text-zinc-200"
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {passwordError ? (
          <p id="password-error" className="mt-1.5 text-sm text-[#ff9b8a]">
            {passwordError}
          </p>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-zinc-400">
        Use at least 8 characters, with a letter and a number.
      </p>

      {alertMessage ? (
        <p role="alert" className="text-sm text-[#ff9b8a]">
          {alertMessage}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-[#d5ee8a]">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-medium text-white transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-wait disabled:opacity-60"
      >
        {mode === "sign-in" ? "Log in" : "Create account"}
      </button>

      <div className="flex items-center gap-3 py-1" role="separator" aria-label="or">
        <span className="h-px flex-1 border-t border-zinc-800" />
        <span className="text-[11px] font-medium tracking-[0.16em] text-zinc-500 uppercase">OR</span>
        <span className="h-px flex-1 border-t border-zinc-800" />
      </div>

      <div className="space-y-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueWithGoogle()}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm font-medium text-white transition hover:bg-zinc-900 disabled:cursor-wait disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueWithFacebook()}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm font-medium text-white transition hover:bg-zinc-900 disabled:cursor-wait disabled:opacity-60"
        >
          <FacebookMark />
          Continue with Facebook
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueWith("apple")}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm font-medium text-white transition hover:bg-zinc-900 disabled:cursor-wait disabled:opacity-60"
        >
          <AppleMark />
          Continue with Apple
        </button>
      </div>

      <p className="pt-3 text-center text-sm text-zinc-400">
        {mode === "create" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => switchMode("sign-in")}
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Need an account?{" "}
            <button
              type="button"
              onClick={() => switchMode("create")}
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              Create one
            </button>
          </>
        )}
      </p>
    </form>
  );
}
