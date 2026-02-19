"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { listBoards, createBoard } from "@/lib/boards";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const { data: boards } = await listBoards();
      if (boards && boards.length > 0) {
        router.replace(`/board/${boards[0].id}`);
      } else {
        const { data: board } = await createBoard("My Board");
        if (board) router.replace(`/board/${board.id}`);
      }
    }
    redirect();
  }, [router]);

  return <p className="p-6 text-sm text-neutral-400">Loading…</p>;
}
