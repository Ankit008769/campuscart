"use client";

import {
  ACCEPT_WINDOW_MS,
  FUNNEL_STEP_LABEL,
  ORDER_STATUS_LABEL,
  formatPaise,
  funnelReport,
  listOpenOrders,
  listOrdersSince,
  transitionOrder,
  watchOrders,
  type OrderStatus,
} from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Order = Awaited<ReturnType<typeof listOpenOrders>>[number];
type DayOrder = Awaited<ReturnType<typeof listOrdersSince>>[number];
type FunnelStep = Awaited<ReturnType<typeof funnelReport>>[number];

// Open orders, in the order ops staff watch them move across the board.
const BOARD_COLUMNS: OrderStatus[] = ["placed", "accepted", "ready", "out_for_delivery"];
// A new order turns red a minute before it expires, so ops can phone the shop.
const LATE_MS = ACCEPT_WINDOW_MS - 60 * 1000;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function startOfToday(): string {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day.toISOString();
}

export default function LiveBoard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [today, setToday] = useState<DayOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);

  useEffect(() => {
    let active = true;
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    funnelReport(supabase, from.toISOString(), to.toISOString()).then(
      (steps) => active && setFunnel(steps),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([listOpenOrders(supabase), listOrdersSince(supabase, startOfToday())]).then(
        ([open, day]) => {
          if (!active) return;
          setOrders(open);
          setToday(day);
          setError(null);
        },
        (e: unknown) => active && setError(messageOf(e)),
      );
    load();
    const unsubscribe = watchOrders(supabase, null, load);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(tick);
    };
  }, []);

  async function cancel(order: Order) {
    const reason = window.prompt(`Cancel order #${order.code}? Tell the student why:`);
    if (!reason?.trim()) return;
    try {
      await transitionOrder(supabase, { orderId: order.id, to: "cancelled", note: reason });
    } catch (e) {
      setError(messageOf(e));
    }
  }

  const completed = today.filter((o) => o.status === "delivered" || o.status === "collected");
  const dropped = today.filter((o) => o.status === "rejected" || o.status === "cancelled" || o.status === "expired");

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Live board</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          New orders turn red when a shop has not accepted within {LATE_MS / 60000} minutes. They expire after{" "}
          {ACCEPT_WINDOW_MS / 60000}.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Orders today" value={String(today.length)} />
        <Stat label="Completed" value={String(completed.length)} />
        <Stat label="Sales completed" value={formatPaise(completed.reduce((sum, o) => sum + o.total_paise, 0))} />
        <Stat label="Rejected, cancelled or expired" value={String(dropped.length)} />
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!orders && !error && <p className="text-sm text-zinc-500">Loading orders…</p>}

      {orders && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {BOARD_COLUMNS.map((status) => {
            const column = orders.filter((o) => o.status === status);
            return (
              <div
                key={status}
                className="flex min-h-48 flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <h2 className="text-sm font-semibold">
                  {ORDER_STATUS_LABEL[status]} ({column.length})
                </h2>
                {column.length === 0 && <p className="text-sm text-zinc-500">No orders</p>}
                {column.map((order) => (
                  <OrderCard key={order.id} order={order} now={now} onCancel={() => cancel(order)} />
                ))}
              </div>
            );
          })}
        </section>
      )}

      {funnel.length > 0 && <Funnel steps={funnel} />}
    </>
  );
}

/** Students at each step over the last 7 days, and how many of the step before carried on. */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.students ?? 0);
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold">From opening the app to ordering, last 7 days</h2>
      {steps.map((step, i) => {
        const before = i > 0 ? steps[i - 1].students : null;
        return (
          <div key={step.step} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-3 text-sm">
            <span>{FUNNEL_STEP_LABEL[step.step] ?? step.step}</span>
            <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
              <div className="h-3 rounded bg-[#1A9E4B]" style={{ width: `${(100 * step.students) / top}%` }} />
            </div>
            <span className="text-right">
              {step.students}
              {before ? <span className="text-zinc-500"> · {Math.round((100 * step.students) / before)}%</span> : null}
            </span>
          </div>
        );
      })}
      <p className="text-xs text-zinc-500">Students counted once per step. The percentage is of the step above.</p>
    </section>
  );
}

function OrderCard({ order, now, onCancel }: { order: Order; now: number; onCancel: () => void }) {
  // Scheduled orders reach the shop when released, so their clock starts then.
  const ageMs = now - new Date(order.released_at ?? order.placed_at).getTime();
  const late = order.status === "placed" && ageMs > LATE_MS;
  const items = order.order_items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <article
      className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${
        late ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">#{order.code}</span>
        <span className={late ? "font-semibold text-red-600" : "text-zinc-500"}>{Math.max(0, Math.floor(ageMs / 60000))} min</span>
      </div>
      <span>{order.shops?.name}</span>
      <span className="text-zinc-600 dark:text-zinc-400">
        {order.mode === "delivery" ? `Deliver to ${order.drop_points?.name ?? "?"}` : `Pickup, token #${order.token_no}`} ·{" "}
        {items} {items === 1 ? "item" : "items"} · {formatPaise(order.total_paise)}
      </span>
      {order.profiles && (
        <span className="text-zinc-600 dark:text-zinc-400">
          {order.profiles.name || "Student"}
          {order.profiles.phone && (
            <>
              {" · "}
              <a href={`tel:${order.profiles.phone}`} className="text-[#1A9E4B] underline">
                {order.profiles.phone}
              </a>
            </>
          )}
        </span>
      )}
      <button onClick={onCancel} className="mt-1 self-start text-xs font-semibold text-red-600 hover:underline">
        Cancel order
      </button>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
