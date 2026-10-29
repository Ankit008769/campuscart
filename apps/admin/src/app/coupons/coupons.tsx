"use client";

import {
  couponLabel,
  createCoupon,
  listCoupons,
  listShopsForAdmin,
  parseRupees,
  setCouponActive,
  type CouponInput,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Coupon = Awaited<ReturnType<typeof listCoupons>>[number];
type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
/** A yyyy-mm-dd date input as the start of that day in the viewer's time zone (India for ops). */
const dayStart = (date: string, plusDays = 0) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return d.toISOString();
};

const EMPTY = {
  code: "",
  description: "",
  kind: "flat" as "flat" | "percent",
  value: "",
  maxDiscount: "",
  minSubtotal: "",
  shopId: "",
  fundedBy: "platform" as "platform" | "shop",
  starts: "",
  ends: "",
  maxUses: "",
  perStudent: "1",
  firstOrderOnly: false,
  listed: true,
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listCoupons(supabase), listShopsForAdmin(supabase)]).then(
      ([nextCoupons, nextShops]) => {
        if (!active) return;
        setCoupons(nextCoupons);
        setShops(nextShops);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm({ ...form, [key]: value });

  function toInput(): CouponInput | string {
    const value = form.kind === "flat" ? parseRupees(form.value) : Number(form.value);
    if (!/^[A-Za-z0-9]{3,20}$/.test(form.code.trim())) return "Codes are 3 to 20 letters and digits.";
    if (value === null || !Number.isInteger(value) || value <= 0) return "Enter how much the coupon takes off.";
    if (form.kind === "percent" && value > 100) return "A percent coupon takes off at most 100%.";
    const maxDiscount = form.maxDiscount.trim() ? parseRupees(form.maxDiscount) : null;
    const minSubtotal = form.minSubtotal.trim() ? parseRupees(form.minSubtotal) : 0;
    if (form.maxDiscount.trim() && !maxDiscount) return "The cap is an amount in rupees.";
    if (minSubtotal === null) return "The minimum order is an amount in rupees.";
    const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
    const perStudent = Number(form.perStudent);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return "Total uses is a whole number.";
    if (!Number.isInteger(perStudent) || perStudent < 1) return "Uses per student is a whole number.";
    return {
      code: form.code,
      description: form.description,
      kind: form.kind,
      value,
      maxDiscountPaise: maxDiscount,
      minSubtotalPaise: minSubtotal,
      shopId: form.shopId || null,
      fundedBy: form.fundedBy,
      startsAt: form.starts ? dayStart(form.starts) : new Date().toISOString(),
      // The end date is inclusive: the coupon works until that day is over.
      endsAt: form.ends ? dayStart(form.ends, 1) : null,
      maxUses,
      perStudentLimit: perStudent,
      firstOrderOnly: form.firstOrderOnly,
      listed: form.listed,
    };
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const coupon = toInput();
    if (typeof coupon === "string") return setError(coupon);
    setSaving(true);
    setError(null);
    try {
      await createCoupon(supabase, coupon);
      setForm(EMPTY);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(coupon: Coupon) {
    try {
      await setCouponActive(supabase, coupon.code, !coupon.active);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Coupons</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Students enter a code at checkout, or tap a listed one. The database checks every rule again when the order is
        placed, and a coupon never takes off more than the items cost. Fees are always charged in full.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form onSubmit={onCreate} className={`${card} grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4`}>
        <label className="flex flex-col gap-1">
          Code
          <input className={input} value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="WELCOME20" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Description (students see it)
          <input className={input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="₹20 off your first order" />
        </label>
        <label className="flex flex-col gap-1">
          Kind
          <select className={input} value={form.kind} onChange={(e) => set("kind", e.target.value as "flat" | "percent")}>
            <option value="flat">Flat ₹ off</option>
            <option value="percent">Percent off</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {form.kind === "flat" ? "Takes off (₹)" : "Takes off (%)"}
          <input className={input} inputMode="decimal" value={form.value} onChange={(e) => set("value", e.target.value)} />
        </label>
        {form.kind === "percent" && (
          <label className="flex flex-col gap-1">
            Up to (₹, optional)
            <input className={input} inputMode="decimal" value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          Minimum item total (₹)
          <input className={input} inputMode="decimal" value={form.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} placeholder="0" />
        </label>
        <label className="flex flex-col gap-1">
          Shop
          <select className={input} value={form.shopId} onChange={(e) => set("shopId", e.target.value)}>
            <option value="">Every shop</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Who pays for it
          <select className={input} value={form.fundedBy} onChange={(e) => set("fundedBy", e.target.value as "platform" | "shop")}>
            <option value="platform">CampusCart</option>
            <option value="shop">The shop</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Starts
          <input className={input} type="date" value={form.starts} onChange={(e) => set("starts", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Last day (optional)
          <input className={input} type="date" value={form.ends} onChange={(e) => set("ends", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Total uses (optional)
          <input className={input} inputMode="numeric" value={form.maxUses} onChange={(e) => set("maxUses", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Uses per student
          <input className={input} inputMode="numeric" value={form.perStudent} onChange={(e) => set("perStudent", e.target.value)} />
        </label>
        <div className="flex flex-col justify-end gap-1">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => set("firstOrderOnly", e.target.checked)} />
            First order only
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.listed} onChange={(e) => set("listed", e.target.checked)} />
            Show in the app
          </label>
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={saving} className="rounded-md bg-[#1A9E4B] px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            {saving ? "Creating…" : "Create coupon"}
          </button>
        </div>
      </form>

      {!coupons && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {coupons?.length === 0 && <p className="text-sm text-zinc-500">No coupons yet.</p>}
      {coupons && coupons.length > 0 && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Offer</th>
                <th className="p-3">Where</th>
                <th className="p-3">Runs</th>
                <th className="p-3">Used</th>
                <th className="p-3">On</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.code} className={`border-t border-zinc-200 dark:border-zinc-800 ${coupon.active ? "" : "opacity-50"}`}>
                  <td className="p-3 font-semibold">
                    {coupon.code}
                    <span className="block text-xs font-normal text-zinc-500">
                      {[coupon.listed ? "listed" : "code only", coupon.first_order_only && "first order", coupon.funded_by === "shop" && "shop pays"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="p-3">
                    {couponLabel(coupon)}
                    {coupon.description && <span className="block text-xs text-zinc-500">{coupon.description}</span>}
                  </td>
                  <td className="p-3">{coupon.shops?.name ?? "Every shop"}</td>
                  <td className="p-3 text-zinc-600 dark:text-zinc-400">
                    {day(coupon.starts_at)} to {coupon.ends_at ? day(new Date(Date.parse(coupon.ends_at) - 1).toISOString()) : "no end"}
                  </td>
                  <td className="p-3">
                    {coupon.coupon_redemptions[0]?.count ?? 0}
                    {coupon.max_uses ? ` of ${coupon.max_uses}` : ""}
                  </td>
                  <td className="p-3">
                    <input type="checkbox" aria-label={`${coupon.code} switched on`} checked={coupon.active} onChange={() => toggle(coupon)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
