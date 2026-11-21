"use client";

import {
  RIDER_STATUS_LABEL,
  decideRider,
  formatPaise,
  listRiderPayouts,
  listRiders,
  markPayoutPaid,
  payoutWeekOf,
  prepareRiderPayouts,
  type RiderStatus,
} from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

import { RiderCash } from "./rider-cash";

type Rider = Awaited<ReturnType<typeof listRiders>>[number];
type Payout = Awaited<ReturnType<typeof listRiderPayouts>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const button = "rounded-md bg-[#1A9E4B] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The Monday of last week, the most recent week that is over. */
const lastWeek = () => payoutWeekOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[] | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listRiders(supabase), listRiderPayouts(supabase)]).then(
      ([nextRiders, nextPayouts]) => {
        if (!active) return;
        setRiders(nextRiders);
        setPayouts(nextPayouts);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  function decide(rider: Rider, status: RiderStatus) {
    const needsNote = status === "rejected" || status === "suspended";
    const note = needsNote ? window.prompt(`Why? ${rider.profiles?.name ?? "The student"} sees this note.`) : undefined;
    if (needsNote && !note?.trim()) return;
    run(() => decideRider(supabase, rider.profile_id, status, note ?? undefined));
  }

  function prepare() {
    const week = lastWeek();
    run(async () => {
      const made = await prepareRiderPayouts(supabase, week);
      setNotice(made === 0 ? `No new payouts for the week of ${date(week)}.` : `Prepared ${made} payouts for the week of ${date(week)}.`);
    });
  }

  function markPaid(payout: Payout) {
    const reference = window.prompt(`UPI reference for paying ${formatPaise(payout.amount_paise)} to ${payout.profiles?.name ?? "the rider"}:`);
    if (!reference?.trim()) return;
    run(() => markPayoutPaid(supabase, payout.id, reference));
  }

  const upiOf = (riderId: string) => riders?.find((r) => r.profile_id === riderId)?.upi_vpa ?? "?";

  return (
    <>
      <h1 className="text-2xl font-semibold">Riders</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">{notice}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Applications and riders</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Students apply from the student app (Orders → Deliver for CampusCart). Suspending or rejecting takes a rider
          offline at once; deliveries they already hold stay with them.
        </p>
        {!riders && !error && <p className="text-sm text-zinc-500">Loading…</p>}
        {riders?.length === 0 && <p className="text-sm text-zinc-500">No applications yet.</p>}
        {riders && riders.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">UPI ID</th>
                  <th className="p-3">Applied</th>
                  <th className="p-3">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.profile_id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3">
                      {rider.profiles?.name || "—"}
                      <span className="block text-xs text-zinc-500">
                        {rider.profiles?.email} · {rider.profiles?.phone ?? "no phone"}
                      </span>
                    </td>
                    <td className="p-3">{rider.upi_vpa}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{date(rider.applied_at)}</td>
                    <td className="p-3">
                      {RIDER_STATUS_LABEL[rider.status]}
                      {rider.status === "approved" && (rider.online ? " · online" : " · offline")}
                      {rider.admin_note && <span className="block text-xs text-zinc-500">{rider.admin_note}</span>}
                    </td>
                    <td className="space-x-3 whitespace-nowrap p-3 text-right">
                      {rider.status !== "approved" && (
                        <button onClick={() => decide(rider, "approved")} className="text-xs font-semibold text-[#1A9E4B] hover:underline">
                          {rider.status === "suspended" ? "Reinstate" : "Approve"}
                        </button>
                      )}
                      {rider.status === "applied" && (
                        <button onClick={() => decide(rider, "rejected")} className="text-xs font-semibold text-red-600 hover:underline">
                          Reject
                        </button>
                      )}
                      {rider.status === "approved" && (
                        <button onClick={() => decide(rider, "suspended")} className="text-xs font-semibold text-red-600 hover:underline">
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RiderCash />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Weekly payouts</h2>
          <button onClick={prepare} className={button}>
            Prepare payouts for the week of {date(lastWeek())}
          </button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Weeks run Monday to Sunday, Indian time. Preparing adds up each rider&apos;s delivered orders that aren&apos;t in a
          payout yet. Pay each rider by UPI, then record the payment&apos;s reference here.
        </p>
        {payouts.length === 0 ? (
          <p className="text-sm text-zinc-500">No payouts yet.</p>
        ) : (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Rider</th>
                  <th className="p-3">Week of</th>
                  <th className="p-3">Deliveries</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Paid</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3">
                      {payout.profiles?.name || "—"}
                      <span className="block text-xs text-zinc-500">{upiOf(payout.rider_id)}</span>
                    </td>
                    <td className="p-3">{date(payout.week_start)}</td>
                    <td className="p-3">{payout.deliveries}</td>
                    <td className="p-3 text-right">{formatPaise(payout.amount_paise)}</td>
                    <td className="p-3">
                      {payout.paid_at ? (
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {date(payout.paid_at)} · {payout.reference}
                        </span>
                      ) : (
                        <button onClick={() => markPaid(payout)} className="text-xs font-semibold text-[#1A9E4B] hover:underline">
                          Record payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
