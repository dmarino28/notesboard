"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "password" | "magic-link" | "signup";

// Wrapped in Suspense below because useSearchParams() requires a boundary.
function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/actions";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false); // magic-link success state

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "magic-link") {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      setLoading(false);
      if (otpError) {
        setError(
          otpError.message.includes("rate limit") || otpError.status === 429
            ? "Too many requests — wait a minute before trying again."
            : otpError.message,
        );
      } else {
        setSent(true);
      }
      return;
    }

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      // Email confirm is disabled in Supabase settings, so sign-up creates a
      // session immediately — proceed as if signed in.
      window.location.href = next;
      return;
    }

    // mode === "password"
    const { error: pwError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (pwError) {
      setError(
        pwError.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password."
          : pwError.message,
      );
      return;
    }
    window.location.href = next;
  }

  const labels: Record<Mode, { title: string; subtitle: string; submit: string }> = {
    password:     { title: "Sign in",        subtitle: "Sign in with your email and password.", submit: "Sign in" },
    "magic-link": { title: "Magic link",     subtitle: "We'll email you a sign-in link.",       submit: "Send magic link" },
    signup:       { title: "Create account", subtitle: "Pick a password to create your account.", submit: "Create account" },
  };

  const { title, subtitle, submit } = labels[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl shadow-black/40">
        <h1 className="mb-1 text-base font-semibold tracking-tight text-neutral-100">
          {title}
        </h1>
        <p className="mb-6 text-xs text-neutral-500">{subtitle}</p>

        {mode === "magic-link" && sent ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-200">Check your email</p>
            <p className="text-xs text-neutral-500">
              Link sent to <span className="text-neutral-300">{email}</span>. Click it to sign in.
            </p>
            <button
              type="button"
              className="mt-3 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300 transition-colors"
              onClick={() => switchMode("magic-link")}
            >
              Resend
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
              />
            </div>

            {/* Password — shown in password + signup modes */}
            {mode !== "magic-link" && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim() || (mode !== "magic-link" && !password)}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "…" : submit}
            </button>

            {/* Mode toggles */}
            <div className="flex flex-wrap items-center justify-between gap-y-1 pt-1">
              <button
                type="button"
                className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                onClick={() => switchMode(mode === "magic-link" ? "password" : "magic-link")}
              >
                {mode === "magic-link" ? "Use password instead" : "Use magic link instead"}
              </button>
              {mode !== "magic-link" && (
                <button
                  type="button"
                  className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                  onClick={() => switchMode(mode === "signup" ? "password" : "signup")}
                >
                  {mode === "signup" ? "Have an account? Sign in" : "Need an account?"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
