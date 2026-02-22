"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/actions");
  }, [router]);

  return <p className="p-6 text-sm text-neutral-400">Loading…</p>;
}
