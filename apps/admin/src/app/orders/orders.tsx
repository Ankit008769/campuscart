"use client";

import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  formatPaise,
  getOrder,
  isFinal,
  listOrderEvents,
  listShopsForAdmin,
  searchOrders,
  transitionOrder,
  type OrderSearch,
  type OrderStatus,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Hit = Awaited<ReturnType<typeof searchOrders>>[number];
type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];
type Detail = Awaited<ReturnType<typeof getOrder>>["order"];
type Event = Awaited<ReturnType<typeof listOrderEvents>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
/** A yyyy-mm-dd date input as the start of that day in the viewer's time zone (India for ops). */
const dayStart = (date: string, plusDays = 0) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
};

export default function OrdersPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [query, setQuery] = useState("");
  const [shopId, setShopId] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState<OrderSearch>({});
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listShopsForAdmin(supabase).then(
      (next) => active && setShops(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    searchOrders(supabase, search).then(
      (next) => {
        if (!active) return;
        setHits(next);
        setError(null);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [search]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSelected(null);
    setSearch({
      query,
      shopId: shopId || undefined,
      status: status || undefined,
      from: from ? dayStart(from) : undefined,
      to: to ? dayStart(to, 1) : undefined,
    });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <form onSubmit={onSearch} className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-sm">
          Order code, student name, email or phone
          <input className={`${input} w-72`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. 98765 or Meera" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Shop
          <select className={input} value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="">All shops</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "")}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input className={input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input className={input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="rounded-md bg-[#1A9E4B] px-3 py-1.5 text-sm font-semibold text-white">
          Search
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!hits && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {hits?.length === 0 && <p className="text-sm text-zinc-500">No orders match.</p>}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {hits && hits.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Placed</th>
                  <th className="p-3">Shop</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr
                    key={hit.id}
                    onClick={() => setSelected(hit.id)}
                    className={`cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 ${
                      selected === hit.id ? "bg-green-50 dark:bg-green-950" : ""
                    }`}
                  >
                    <td className="p-3 font-semibold">#{hit.code}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{when(hit.placed_at)}</td>
                    <td className="p-3">{hit.shop_name}</td>
                    <td className="p-3">
                      {hit.student_name || "—"}
                      <span className="block text-xs text-zinc-500">{hit.student_phone ?? hit.student_email}</span>
                    </td>
                    <td className="p-3">{ORDER_STATUS_LABEL[hit.status]}</td>
                    <td className="p-3 text-right">{formatPaise(hit.total_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected && (
          <OrderDetail
            key={selected}
            orderId={selected}
            onChanged={() => setSearch((s) => ({ ...s }))}
            onError={setError}
          />
        )}
      </div>
    </>
  );
}

function OrderDetail({
  orderId,
  onChanged,
  onError,
}: {
  orderId: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [order, setOrder] = useState<Detail | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getOrder(supabase, orderId), listOrderEvents(supabase, orderId)]).then(
      ([detail, timeline]) => {
        if (!active) return;
        setOrder(detail.order);
        setEvents(timeline);
      },
      (e: unknown) => active && onError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [orderId, version, onError]);

  async function cancel() {
    if (!order) return;
    const reason = window.prompt(`Cancel order #${order.code}? Tell the student why:`);
    if (!reason?.trim()) return;
    try {
      await transitionOrder(supabase, { orderId, to: "cancelled", note: reason });
      setVersion((v) => v + 1);
      onChanged();
    } catch (e) {
      onError(messageOf(e));
    }
  }

  if (!order) return <div className={card}>Loading order…</div>;

  return (
    <div className={`${card} flex flex-col gap-3 text-sm`}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">#{order.code}</h2>
        <span className="font-semibold">{ORDER_STATUS_LABEL[order.status]}</span>
      </div>
      <p className="text-zinc-600 dark:text-zinc-400">
        {order.shops?.name} ·{" "}
        {order.mode === "delivery"
          ? `Deliver to ${order.drop_points?.name ?? "?"}${order.room_note ? `, ${order.room_note}` : ""}`
          : `Pickup, token #${order.token_no}`}
      </p>
      {order.profiles && (
        <p>
          {order.profiles.name || "Student"}
          {order.profiles.phone && (
            <>
              {" · "}
              <a href={`tel:${order.profiles.phone}`} className="text-[#1A9E4B] underline">
                {order.profiles.phone}
              </a>
            </>
          )}
        </p>
      )}

      <table className="w-full">
        <tbody>
          {order.order_items.map((item) => (
            <tr key={item.id}>
              <td className="py-0.5">
                {item.qty} × {item.name_snapshot}
              </td>
              <td className="py-0.5 text-right">{formatPaise(item.price_paise_snapshot * item.qty)}</td>
            </tr>
          ))}
          <BillRow label="Delivery" paise={order.delivery_fee_paise + order.small_cart_fee_paise} />
          <BillRow label="Platform fee" paise={order.platform_fee_paise} />
          <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-800">
            <td className="pt-1">Total ({order.pay_method === "cash" ? "cash" : "UPI"} at handover)</td>
            <td className="pt-1 text-right">{formatPaise(order.total_paise)}</td>
          </tr>
        </tbody>
      </table>

      <div>
        <h3 className="mb-1 font-semibold">Timeline</h3>
        <ol className="flex flex-col gap-1">
          {events.map((event) => (
            <li key={event.id} className="text-zinc-600 dark:text-zinc-400">
              {when(event.at)}: {ORDER_STATUS_LABEL[event.to_status]} by {event.actor}
              {event.note ? ` (“${event.note}”)` : ""}
            </li>
          ))}
        </ol>
      </div>

      {!isFinal(order.status) && (
        <button onClick={cancel} className="self-start text-sm font-semibold text-red-600 hover:underline">
          Cancel order
        </button>
      )}
    </div>
  );
}

function BillRow({ label, paise }: { label: string; paise: number }) {
  if (paise === 0) return null;
  return (
    <tr className="text-zinc-600 dark:text-zinc-400">
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right">{formatPaise(paise)}</td>
    </tr>
  );
}
