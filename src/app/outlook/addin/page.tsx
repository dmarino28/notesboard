"use client";

import { useEffect, useRef, useState } from "react";
import { OutlookAddinShell } from "@/components/outlook/OutlookAddinShell";
import { supabase } from "@/lib/supabase";
import {
  readOutlookItem,
  readCurrentItemSync,
  type ReadItemResult,
  type OutlookThread,
} from "@/lib/outlookContext";

export default function OutlookAddinPage() {
  // null = still checking, false = unauthenticated, true = authenticated
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [init, setInit] = useState<ReadItemResult | null>(null);
  // Live thread — updated on every ItemChanged event while the pane stays open.
  // Separate from `init` so `init` still carries host/error info for the shell.
  const [currentThread, setCurrentThread] = useState<OutlookThread | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── Auth gate ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Seed from the current session immediately so there's no flicker on
    // subsequent opens when the session cookie is still valid.
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });

    // Stay in sync with sign-in / sign-out events.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAuthed(!!session);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Office.js init ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    readOutlookItem().then((result) => {
      if (cancelled) return;
      setInit(result);
      if (result.kind !== "ok") return;

      // Seed live thread from the initial (async) read — it includes webLink.
      setCurrentThread(result.thread);

      // Register ItemChanged so a pinned task pane tracks the selected email.
      // The handler MUST re-read mailbox.item inside itself; never close over a
      // captured item reference.
      try {
        function onItemChanged() {
          // readCurrentItemSync() reads Office.context.mailbox.item at call-time.
          setCurrentThread(readCurrentItemSync());
        }

        Office.context.mailbox.addHandlerAsync(
          Office.EventType.ItemChanged,
          onItemChanged,
        );

        cleanupRef.current = () => {
          try {
            // Removes all ItemChanged handlers — we only ever register one.
            Office.context.mailbox.removeHandlerAsync(Office.EventType.ItemChanged);
          } catch {
            // Ignore — pane may already be tearing down.
          }
        };
      } catch {
        // Office.EventType.ItemChanged unavailable in this host/version — degrade silently.
      }
    });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, []);

  // Still resolving the session.
  if (authed === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <span className="text-xs text-neutral-600">Initializing…</span>
      </div>
    );
  }

  // Not signed in — show the sign-in gate before doing anything else.
  if (!authed) {
    return <AddinSignIn />;
  }

  // Signed in but Office.js hasn't resolved yet.
  if (!init) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <span className="text-xs text-neutral-600">Initializing…</span>
      </div>
    );
  }

  return <OutlookAddinShell init={init} currentThread={currentThread} />;
}

// ── Sign-in form ───────────────────────────────────────────────────────────────
// Compact email + password form for the Office task pane WebView.
// Magic link is intentionally excluded: the redirect URL opens in the desktop
// browser, not in the WebView, so the cookie would be written to the wrong
// context and the add-in session would remain unauthenticated.
function AddinSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (authError) {
      setError(
        authError.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password."
          : authError.message,
      );
    }
    // On success, onAuthStateChange fires → setAuthed(true) → shell renders.
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 px-5">
      <div className="w-full max-w-[280px] space-y-5">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-neutral-100">Sign in to NotesBoard</p>
          <p className="text-xs text-neutral-500">Required to access your boards and cards.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoFocus
            className="w-full rounded-lg border border-white/[0.08] bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full rounded-lg border border-white/[0.08] bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-indigo-500/50"
          />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full cursor-pointer rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
