"use client";

import { useEffect, useRef, useState } from "react";
import { OutlookAddinShell } from "@/components/outlook/OutlookAddinShell";
import {
  readOutlookItem,
  readCurrentItemSync,
  type ReadItemResult,
  type OutlookThread,
} from "@/lib/outlookContext";

export default function OutlookAddinPage() {
  const [init, setInit] = useState<ReadItemResult | null>(null);
  // Live thread — updated on every ItemChanged event while the pane stays open.
  // Separate from `init` so `init` still carries host/error info for the shell.
  const [currentThread, setCurrentThread] = useState<OutlookThread | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

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

  if (!init) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <span className="text-xs text-neutral-600">Initializing…</span>
      </div>
    );
  }

  return <OutlookAddinShell init={init} currentThread={currentThread} />;
}
