"use client";

import { listSuggestions, markSuggestionsRead } from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Suggestion = Awaited<ReturnType<typeof listSuggestions>>[number];

const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** What students sent from Account → Suggestions in the app, newest first. Opening the page marks them read. */
export default function SuggestionsPage() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listSuggestions(supabase).then(
      (rows) => {
        if (!active) return;
        setItems(rows);
        markSuggestionsRead(supabase, rows.filter((r) => !r.read_at).map((r) => r.id)).catch(() => {});
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load suggestions."),
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Suggestions</h1>
        <p className="text-sm text-zinc-500">Ideas and problems students sent from Account → Suggestions in the app.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!items && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {items?.length === 0 && <p className="text-sm text-zinc-500">No suggestions yet.</p>}
      {items?.map((s) => (
        <div key={s.id} className={card}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{s.name || s.email || "Someone"}</span>
            {!s.read_at && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">New</span>}
            {s.role !== "student" && <span className="text-zinc-500">{s.role === "admin" ? "Admin" : "Shop"}</span>}
            <span className="ml-auto text-zinc-500">{when(s.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{s.body}</p>
          <div className="mt-2 flex gap-4 text-sm">
            {s.email && (
              <a className="text-green-700 underline" href={`mailto:${s.email}?subject=Your Campus Cart suggestion`}>
                {s.email}
              </a>
            )}
            {s.phone && (
              <a className="text-green-700 underline" href={`tel:${s.phone}`}>
                {s.phone}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
