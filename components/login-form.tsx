"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Provider, Session, SupabaseClient } from "@supabase/supabase-js";
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
      <label htmlFor={id} className="mb-2 block text-sm font-light text-white/70">
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
        className="h-12 w-full rounded-xl border border-white/15 bg-[#121212] px-4 text-base font-light text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/40"
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
        fill="#fff"
        d="M21.6 12.23c0-.74-.07-1.45-.19-2.14H12v4.05h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.43Z"
      />
      <path
        fill="#fff"
        d="M12 22c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fff"
        d="M6.41 13.9A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.9V7.52H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.48l3.35-2.58Z"
      />
      <path
        fill="#fff"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.06 7.52l3.35 2.58C7.2 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-white">
      <path d="M16.37 12.72c.03 2.4 2.1 3.2 2.13 3.21-.02.06-.33 1.14-1.1 2.26-.66.96-1.35 1.92-2.43 1.94-1.06.02-1.4-.63-2.62-.63-1.21 0-1.6.61-2.6.65-1.04.04-1.84-1.04-2.51-2-.1-.14-1.7-2.5-1.7-4.78 0-2.82 1.83-4.32 3.63-4.37 1.04-.02 2.02.7 2.62.7.6 0 1.72-.87 2.9-.74.49.02 1.88.2 2.77 1.5-.07.04-1.65 1-1.62 2.26ZM14.7 6.9c.55-.67.92-1.6.82-2.53-.79.03-1.75.53-2.32 1.2-.51.59-.96 1.54-.84 2.45.88.07 1.78-.45 2.34-1.12Z" />
    </svg>
  );
}

const VERIFY_NOTICE = "Check your email inbox for the verification link.";

export function LoginForm({ supabase }: { supabase: SupabaseClient }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAccountBalance } = useCredits();
  const [mode, setMode] = useState<Mode>("create");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
          router.push("/create");
          router.refresh();
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          setFormError(message || "Could not save the session.");
          setPending(false);
        }
      })();
    });
    return () => subscription.unsubscribe();
  }, [awaitingVerification, router, setAccountBalance, supabase]);

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

      router.push(afterAuth);
      router.refresh();
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
          redirectTo: authRedirectUrl(),
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
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        autoComplete={mode === "create" ? "new-password" : "current-password"}
        error={passwordError}
        onChange={(value) => {
          setPassword(value);
          setPasswordError(null);
        }}
      />
      <p className="text-xs font-light leading-5 text-white/45">
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
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-black transition-opacity enabled:hover:bg-white/90 disabled:cursor-wait disabled:opacity-60"
      >
        Continue
      </button>

      <div className="space-y-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueWithGoogle()}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-transparent text-sm font-medium text-white transition-colors enabled:hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueWith("apple")}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-transparent text-sm font-medium text-white transition-colors enabled:hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
        >
          <AppleMark />
          Continue with Apple
        </button>
      </div>

      <p className="pt-3 text-center text-sm font-light text-white/55">
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
