"use client";

import {
  DEFAULT_FEE_RULES,
  WEEK_DAYS,
  WEEK_DAY_LABEL,
  createShop,
  formatPaise,
  importCatalog,
  listFeeRules,
  listPrintSettings,
  listShopsForAdmin,
  parseCatalogCsv,
  parseRupees,
  parseShopHours,
  savePrintSettings,
  setFeeRule,
  shopHoursValue,
  updateShop,
  type CsvResult,
  type ImportResult,
  type ShopUpdate,
  type WeekDay,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];

// The fee_rules keys place_order reads, with what each one means.
const FEES = [
  { key: "delivery_fee", label: "Delivery fee", fallback: DEFAULT_FEE_RULES.deliveryFeePaise },
  { key: "small_cart_limit", label: "No small-cart fee from", fallback: DEFAULT_FEE_RULES.smallCartLimitPaise },
  { key: "small_cart_fee", label: "Small-cart fee", fallback: DEFAULT_FEE_RULES.smallCartFeePaise },
  { key: "platform_fee", label: "Platform fee", fallback: DEFAULT_FEE_RULES.platformFeePaise },
  { key: "night_surcharge", label: "Night delivery, 11 PM to 6 AM (extra)", fallback: 0 },
  // Not part of the bill: what a student rider earns per delivery (defaults to the delivery fee).
  { key: "rider_payout", label: "Rider earns per delivery", fallback: DEFAULT_FEE_RULES.deliveryFeePaise },
] as const;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const button = "rounded-md bg-[#1A9E4B] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50";

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [fees, setFees] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([listShopsForAdmin(supabase), listFeeRules(supabase)]).then(
      ([nextShops, rules]) => {
        if (!active) return;
        setShops(nextShops);
        setFees(Object.fromEntries(rules.map((rule) => [rule.key, rule.value_paise])));
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  return (
    <>
      <h1 className="text-2xl font-semibold">Shops and fees</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Shops</h2>
        <NewShopForm onCreated={reload} onError={setError} />
        {!shops && !error && <p className="text-sm text-zinc-500">Loading shops…</p>}
        {shops?.map((shop) => (
          <ShopRow key={`${shop.id}:${version}`} shop={shop} onSaved={reload} onError={setError} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Fees</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every new order is priced with these. Orders already placed keep the fees they were placed with.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEES.map((fee) => (
            <FeeRow
              key={`${fee.key}:${version}`}
              label={fee.label}
              feeKey={fee.key}
              paise={fees[fee.key] ?? fee.fallback}
              onSaved={reload}
              onError={setError}
            />
          ))}
        </div>
      </section>

      {shops && <PrintRates shops={shops} onError={setError} />}
    </>
  );
}

type PrintRow = { shopId: string; on: boolean; bw: string; color: string; maxPages: string };

/** Which shops take Print Store orders, at what price per page. */
function PrintRates({ shops, onError }: { shops: Shop[]; onError: (message: string) => void }) {
  const [rows, setRows] = useState<PrintRow[] | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listPrintSettings(supabase).then(
      (settings) => {
        if (!active) return;
        setRows(
          shops.map((shop) => {
            const s = settings.find((x) => x.shop_id === shop.id);
            return {
              shopId: shop.id,
              on: s?.active ?? false,
              bw: s ? String(s.bw_page_paise / 100) : "2",
              color: s ? String(s.color_page_paise / 100) : "10",
              maxPages: String(s?.max_pages ?? 200),
            };
          }),
        );
      },
      (e: unknown) => active && onError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [shops, onError]);

  const update = (shopId: string, change: Partial<PrintRow>) =>
    setRows((current) => current?.map((r) => (r.shopId === shopId ? { ...r, ...change } : r)) ?? null);

  async function save(row: PrintRow) {
    const bw = parseRupees(row.bw);
    const color = parseRupees(row.color);
    const maxPages = Number(row.maxPages);
    if (!bw || !color) return onError("Print rates are amounts in rupees, like 2 or 1.50.");
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) return onError("Pages per file is 1 to 1000.");
    try {
      await savePrintSettings(supabase, { shopId: row.shopId, bwPagePaise: bw, colorPagePaise: color, maxPages, active: row.on });
      setSaved(row.shopId);
    } catch (e) {
      onError(messageOf(e));
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Print Store</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Shops switched on here take PDF print orders. The price is pages × copies × the rate, worked out by the
        database from the page count it reads in the file.
      </p>
      {rows?.map((row) => (
        <div key={row.shopId} className={`${card} flex flex-wrap items-center gap-x-5 gap-y-2 text-sm`}>
          <span className="min-w-48 flex-1 font-semibold">{shops.find((s) => s.id === row.shopId)?.name}</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={row.on} onChange={(e) => update(row.shopId, { on: e.target.checked })} />
            Takes print orders
          </label>
          <label className="flex items-center gap-1.5">
            Black and white ₹
            <input className={`${input} w-16`} inputMode="decimal" value={row.bw} onChange={(e) => update(row.shopId, { bw: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5">
            Colour ₹
            <input className={`${input} w-16`} inputMode="decimal" value={row.color} onChange={(e) => update(row.shopId, { color: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5">
            Pages per file
            <input className={`${input} w-16`} inputMode="numeric" value={row.maxPages} onChange={(e) => update(row.shopId, { maxPages: e.target.value })} />
          </label>
          <button onClick={() => save(row)} className={button}>
            Save
          </button>
          {saved === row.shopId && <span className="text-xs text-[#1A9E4B]">Saved</span>}
        </div>
      ))}
    </section>
  );
}

function NewShopForm({ onCreated, onError }: { onCreated: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createShop(supabase, { name, kind, phone: phone.trim() || null, prepMinutes: 10 });
      setName("");
      setKind("");
      setPhone("");
      onCreated();
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${card} flex flex-wrap items-end gap-3`}>
      <label className="flex flex-col gap-1 text-sm">
        New shop
        <input className={`${input} w-56`} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop name" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        What it sells
        <input className={`${input} w-64`} value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Snacks, chai, Maggi" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input className={`${input} w-36`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <button type="submit" disabled={saving} className={button}>
        {saving ? "Adding…" : "Add shop"}
      </button>
      <p className="w-full text-xs text-zinc-500">
        New shops start closed. Approve the owner&apos;s Gmail on the People page, then import or add the menu.
      </p>
    </form>
  );
}

function ShopRow({ shop, onSaved, onError }: { shop: Shop; onSaved: () => void; onError: (message: string) => void }) {
  const savedHours = parseShopHours(shop.hours);
  const [hours, setHours] = useState({
    set: savedHours !== null,
    opens: savedHours?.opens ?? "09:00",
    closes: savedHours?.closes ?? "22:00",
    closedDays: savedHours?.closedDays ?? ([] as WeekDay[]),
  });
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState({
    is_open: shop.is_open,
    does_delivery: shop.does_delivery,
    does_pickup: shop.does_pickup,
    prep_minutes: String(shop.prep_minutes),
    commission: String(shop.commission_bps / 100),
    phone: shop.phone ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    const prep = Number(draft.prep_minutes);
    const commissionBps = Math.round(Number(draft.commission) * 100);
    if (!Number.isInteger(prep) || prep < 1 || prep > 120) return onError("Prep time is 1 to 120 minutes.");
    if (!Number.isFinite(commissionBps) || commissionBps < 0 || commissionBps > 10000)
      return onError("Commission is 0 to 100 percent.");
    const update: ShopUpdate = {
      is_open: draft.is_open,
      does_delivery: draft.does_delivery,
      does_pickup: draft.does_pickup,
      prep_minutes: prep,
      commission_bps: commissionBps,
      phone: draft.phone.trim() || null,
      hours: shopHoursValue(hours.set ? hours : null),
    };
    setSaving(true);
    try {
      await updateShop(supabase, shop.id, update);
      onSaved();
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  const toggle = (field: "is_open" | "does_delivery" | "does_pickup", label: string) => (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" checked={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.checked })} />
      {label}
    </label>
  );

  const toggleDay = (day: WeekDay) =>
    setHours({
      ...hours,
      closedDays: hours.closedDays.includes(day) ? hours.closedDays.filter((d) => d !== day) : [...hours.closedDays, day],
    });

  return (
    <div className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-48 flex-1">
          <p className="font-semibold">{shop.name}</p>
          <p className="text-xs text-zinc-500">{shop.kind}</p>
        </div>
        {toggle("is_open", "Open")}
        {toggle("does_delivery", "Delivery")}
        {toggle("does_pickup", "Pickup")}
        <label className="flex items-center gap-1.5 text-sm">
          Prep
          <input
            className={`${input} w-16`}
            inputMode="numeric"
            value={draft.prep_minutes}
            onChange={(e) => setDraft({ ...draft, prep_minutes: e.target.value })}
          />
          min
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Commission
          <input
            className={`${input} w-16`}
            inputMode="decimal"
            value={draft.commission}
            onChange={(e) => setDraft({ ...draft, commission: e.target.value })}
          />
          %
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Phone
          <input
            className={`${input} w-36`}
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-[#1A9E4B] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={hours.set} onChange={(e) => setHours({ ...hours, set: e.target.checked })} />
          Set hours
        </label>
        {hours.set && (
          <>
            <label className="flex items-center gap-1.5">
              Opens
              <input className={input} type="time" value={hours.opens} onChange={(e) => setHours({ ...hours, opens: e.target.value })} />
            </label>
            <label className="flex items-center gap-1.5">
              Closes
              <input className={input} type="time" value={hours.closes} onChange={(e) => setHours({ ...hours, closes: e.target.value })} />
            </label>
            <span className="text-zinc-500">Closed on</span>
            {WEEK_DAYS.map((day) => (
              <label key={day} className="flex items-center gap-1">
                <input type="checkbox" checked={hours.closedDays.includes(day)} onChange={() => toggleDay(day)} />
                {WEEK_DAY_LABEL[day]}
              </label>
            ))}
          </>
        )}
        <span className="text-xs text-zinc-500">
          {hours.set
            ? "Times are Indian time. A shop still marked open after closing time is switched off automatically."
            : "No hours: the shop's own open switch decides."}
        </span>
        <button onClick={() => setImporting(!importing)} className="ml-auto text-sm font-semibold text-[#1A9E4B]">
          {importing ? "Close menu import" : "Import menu from CSV"}
        </button>
      </div>

      {importing && <CatalogImport shopId={shop.id} shopName={shop.name} onError={onError} />}
    </div>
  );
}

/** Upload a spreadsheet saved as CSV, check every row, then add the items to one shop. */
function CatalogImport({ shopId, shopName, onError }: { shopId: string; shopName: string; onError: (message: string) => void }) {
  const [parsed, setParsed] = useState<CsvResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [running, setRunning] = useState(false);

  async function onFile(file: File | undefined) {
    setResult(null);
    setParsed(file ? parseCatalogCsv(await file.text()) : null);
  }

  async function run() {
    if (!parsed) return;
    setRunning(true);
    try {
      setResult(await importCatalog(supabase, shopId, parsed.items));
      setParsed(null);
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <p className="text-zinc-600 dark:text-zinc-400">
        Columns: <code>category, item, size, price, mrp, description</code>. One row per size; rows with the same item
        name become one item. A blank MRP means it sells at MRP. Items {shopName} already has are skipped. Photos
        are added later from the shop app.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      {parsed && (
        <>
          <p>
            {parsed.items.length} items ready
            {parsed.errors.length > 0 && `, ${parsed.errors.length} rows need fixing first`}.
          </p>
          {parsed.errors.length > 0 && (
            <ul className="list-disc pl-5 text-red-700 dark:text-red-300">
              {parsed.errors.slice(0, 20).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <button
            onClick={run}
            disabled={running || parsed.items.length === 0 || parsed.errors.length > 0}
            className={`${button} self-start`}
          >
            {running ? "Importing…" : `Add ${parsed.items.length} items to ${shopName}`}
          </button>
        </>
      )}
      {result && (
        <p>
          Added {result.added.length}.{result.skipped.length > 0 && ` Skipped ${result.skipped.length} already on the menu.`}
          {result.failed.length > 0 && ` Failed: ${result.failed.map((f) => `${f.name} (${f.error})`).join("; ")}.`}
        </p>
      )}
    </div>
  );
}

function FeeRow({
  label,
  feeKey,
  paise,
  onSaved,
  onError,
}: {
  label: string;
  feeKey: string;
  paise: number;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState(String(paise / 100));
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = parseRupees(text);
    if (value === null) return onError(`${label}: enter an amount in rupees, like 10 or 12.50.`);
    setSaving(true);
    try {
      await setFeeRule(supabase, feeKey, value);
      onSaved();
    } catch (e) {
      onError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-zinc-500">Now {formatPaise(paise)}</p>
      </div>
      ₹
      <input className={`${input} w-24`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-[#1A9E4B] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
