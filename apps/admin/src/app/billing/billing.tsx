"use client";

import { formatPaise, recentMonths, shopMonthOrders, shopMonthlyBills } from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Bill = Awaited<ReturnType<typeof shopMonthlyBills>>[number];
type Line = Awaited<ReturnType<typeof shopMonthOrders>>[number];

const MONTHS = recentMonths(12);
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Downloads rows as a CSV file the browser saves; a spreadsheet opens it as is. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Each shop's completed orders in a month and the ₹4 platform fee per order that CampusCart
 * collects from it (shops take the fee from students at handover).
 */
export default function BillingPage() {
  const [month, setMonth] = useState(MONTHS[0].value);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    shopMonthlyBills(supabase, month).then(
      (next) => {
        if (!active) return;
        setBills(next);
        setOpen(null);
        setLines({});
      },
      (e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load the bills."),
    );
    return () => {
      active = false;
    };
  }, [month]);

  async function showOrders(shopId: string) {
    setOpen(open === shopId ? null : shopId);
    if (lines[shopId]) return lines[shopId];
    const next = await shopMonthOrders(supabase, shopId, month);
    setLines((prev) => ({ ...prev, [shopId]: next }));
    return next;
  }

  async function exportShop(bill: Bill) {
    try {
      const rows = lines[bill.shop_id] ?? (await shopMonthOrders(supabase, bill.shop_id, month));
      downloadCsv(`campuscart-${bill.shop_name}-${month.slice(0, 7)}.csv`, [
        ["Token", "Order code", "Completed", "Mode", "Paid by", "Items (₹)", "Platform fee (₹)", "Order total (₹)"],
        ...rows.map((l) => [l.token_no, l.code, when(l.completed_at), l.mode, l.pay_method, l.item_sales_paise / 100, l.platform_fee_paise / 100, l.total_paise / 100]),
        [],
        ["", "", "", "", "Total", bill.item_sales_paise / 100, bill.platform_fee_paise / 100, ""],
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export.");
    }
  }

  const due = bills?.reduce((sum, b) => sum + b.platform_fee_paise, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Monthly bills</h1>
      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {bills && <span className="text-sm text-zinc-600 dark:text-zinc-400">Platform fee to collect: <strong>{formatPaise(due)}</strong></span>}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {!bills && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {bills && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="p-3">Shop</th>
                <th className="p-3">Completed orders</th>
                <th className="p-3">Item sales</th>
                <th className="p-3">Delivery</th>
                <th className="p-3">Platform fee due</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <FragmentRow key={bill.shop_id} bill={bill} open={open === bill.shop_id} lines={lines[bill.shop_id]} onToggle={() => showOrders(bill.shop_id).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load orders."))} onExport={() => exportShop(bill)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ bill, open, lines, onToggle, onExport }: { bill: Bill; open: boolean; lines?: Line[]; onToggle: () => void; onExport: () => void }) {
  return (
    <>
      <tr className="border-t border-zinc-200 dark:border-zinc-800">
        <td className="p-3 font-medium">{bill.shop_name}</td>
        <td className="p-3">{bill.orders}</td>
        <td className="p-3">{formatPaise(bill.item_sales_paise)}</td>
        <td className="p-3">{formatPaise(bill.delivery_paise)}</td>
        <td className="p-3 font-semibold">{formatPaise(bill.platform_fee_paise)}</td>
        <td className="space-x-3 p-3 text-right text-xs font-semibold text-[#1A9E4B]">
          <button onClick={onToggle} className="hover:underline">{open ? "Hide orders" : "Orders"}</button>
          <button onClick={onExport} className="hover:underline">Download CSV</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-zinc-50 p-3 dark:bg-zinc-900">
            {!lines && <span className="text-zinc-500">Loading…</span>}
            {lines?.length === 0 && <span className="text-zinc-500">No completed orders this month.</span>}
            {lines && lines.length > 0 && (
              <table className="w-full text-xs">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.order_id}>
                      <td className="py-0.5">#{l.token_no} · {l.code}</td>
                      <td className="py-0.5">{when(l.completed_at)}</td>
                      <td className="py-0.5">{l.mode === "delivery" ? "Delivery" : "Pickup"} · {l.pay_method === "cash" ? "cash" : "UPI"}</td>
                      <td className="py-0.5 text-right">{formatPaise(l.total_paise)}</td>
                      <td className="py-0.5 text-right font-semibold">{formatPaise(l.platform_fee_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
