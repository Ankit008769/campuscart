"use client";

import { formatPaise, getRiderCashReport, settleRiderCash } from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Row = Awaited<ReturnType<typeof getRiderCashReport>>[number];

const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cash riders collected on deliveries and haven't handed to the shops, oldest first. Shops confirm
 * it in their app; ops can record it here when a shop confirms by phone.
 */
export function RiderCash() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    getRiderCashReport(supabase).then(
      (next) => {
        if (!active) return;
        setRows(next);
        setLoadedAt(Date.now());
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load rider cash."),
    );
    return () => {
      active = false;
    };
  }, [version]);

  async function settle(row: Row) {
    if (!window.confirm(`Record that ${row.shop_name} received ${formatPaise(row.amount_paise)} from ${row.rider_name}?`)) return;
    setError(null);
    try {
      await settleRiderCash(supabase, row.shop_id, row.rider_id);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record it.");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Cash with riders</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Cash riders collected on deliveries that the shop hasn&apos;t confirmed receiving. A rider holding the
        &quot;most cash a rider may hold&quot; fee (Shops page) can&apos;t take deliveries until shops confirm. Red rows are over a day old.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!rows && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-zinc-500">No rider is holding any cash.</p>}
      {rows && rows.length > 0 && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="p-3">Rider</th>
                <th className="p-3">For shop</th>
                <th className="p-3">Orders</th>
                <th className="p-3">Cash</th>
                <th className="p-3">Since</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const old = loadedAt - Date.parse(row.oldest_at) > DAY_MS;
                return (
                  <tr key={`${row.rider_id}:${row.shop_id}`} className={`border-t border-zinc-200 dark:border-zinc-800 ${old ? "text-red-700 dark:text-red-400" : ""}`}>
                    <td className="p-3">
                      {row.rider_name || "—"}
                      <span className="block text-xs text-zinc-500">{row.rider_phone ?? "no phone"}</span>
                    </td>
                    <td className="p-3">{row.shop_name}</td>
                    <td className="p-3">{row.orders}</td>
                    <td className="p-3 font-semibold">{formatPaise(row.amount_paise)}</td>
                    <td className="p-3">{new Date(row.oldest_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => settle(row)} className="text-xs font-semibold text-[#1A9E4B] hover:underline">
                        Shop received it
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
