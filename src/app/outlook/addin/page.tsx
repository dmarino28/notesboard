"use client";

import { useEffect, useState } from "react";
import { ThreadCapturePane } from "@/components/outlook/ThreadCapturePane";
import { readOutlookItem, type ReadItemResult } from "@/lib/outlookContext";

export default function OutlookAddinPage() {
  const [init, setInit] = useState<ReadItemResult | null>(null);

  useEffect(() => {
    readOutlookItem().then(setInit);
  }, []);

  if (!init) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <span className="text-xs text-neutral-600">Initializing…</span>
      </div>
    );
  }

  return <ThreadCapturePane init={init} />;
}
