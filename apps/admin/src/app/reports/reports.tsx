"use client";

import { formatPaise, missedDemand, platformReport } from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Day = Awaited<ReturnType<typeof platformReport>>[number];
type Missed = Awaited<ReturnType<typeof missedDemand>>[number];

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export default function ReportsPage() {
  const [days, setDays] = useState<number>(7);
  const [rows, setRows] = useState<Day[] | null>(null);
  const [missed, setMissed] = useState<Missed[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // From midnight `days - 1` days ago (Indian time, as ops read it) to now.
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    Promise.all([
      platformReport(supabase, from.toISOString(), new Date().toISOString()),
      missedDemand(supabase, from.toISOString(), new Date().toISOString()),
    ]).then(
      ([next, nextMissed]) => {
        if (!active) return;
        setRows(next);
        setMissed(nextMissed);
        setError(null);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [days]);

  const sum = (pick: (d: Day) => number) => rows?.reduce((t, d) => t + pick(d), 0) ?? 0;
  const orders = sum((d) => d.orders);
  const completed = sum((d) => d.completed);
  const dropped = sum((d) => d.dropped);
  const earned = sum((d) => d.commission_paise + d.fees_paise - d.platform_discount_paise);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Reports</h1>
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={`rounded-full border px-3 py-1 text-sm ${days === p.days ? "border-[#1A9E4B] bg-[#1A9E4B] text-white" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!rows && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {rows && (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Orders" value={String(orders)} />
            <Stat label="Completed" value={String(completed)} />
            <Stat label="Rejected, cancelled or expired" value={orders ? `${Math.round((100 * dropped) / orders)}%` : "—"} />
            <Stat label="Sales completed" value={formatPaise(sum((d) => d.sales_paise))} />
            <Stat label="CampusCart earned" value={formatPaise(earned)} />
          </section>
          <p className="text-xs text-zinc-500">
            Earned = commission + fees − discounts CampusCart paid for. Riders&apos; pay comes out of it.
          </p>

          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3 text-left">Day</th>
                  <th className="p-3">Orders</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">Dropped</th>
                  <th className="p-3">Sales</th>
                  <th className="p-3">Commission</th>
                  <th className="p-3">Fees</th>
                  <th className="p-3">Discounts</th>
                  <th className="p-3">New students</th>
                  <th className="p-3">Accept time</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((d) => (
                  <tr key={d.day} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3 text-left">
                      {new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    <td className="p-3">{d.orders}</td>
                    <td className="p-3">{d.completed}</td>
                    <td className="p-3">{d.dropped}</td>
                    <td className="p-3">{formatPaise(d.sales_paise)}</td>
                    <td className="p-3">{formatPaise(d.commission_paise)}</td>
                    <td className="p-3">{formatPaise(d.fees_paise)}</td>
                    <td className="p-3">{formatPaise(d.platform_discount_paise)}</td>
                    <td className="p-3">{d.new_students}</td>
                    <td className="p-3">{d.avg_accept_seconds === null ? "—" : `${Math.round(d.avg_accept_seconds / 6) / 10} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="font-semibold">Searched for, found nothing</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            What students looked for with no results. Searches are kept without who searched.
          </p>
          {missed.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing yet.</p>
          ) : (
            <div className={`${card} overflow-x-auto p-0`}>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="p-3">Search</th>
                    <th className="p-3">Times</th>
                    <th className="p-3">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {missed.map((m) => (
                    <tr key={m.query} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="p-3">{m.query}</td>
                      <td className="p-3">{m.searches}</td>
                      <td className="p-3 text-zinc-600 dark:text-zinc-400">{new Date(m.last_searched).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
