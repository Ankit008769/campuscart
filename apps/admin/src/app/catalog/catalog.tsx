"use client";

import { formatPaise, listMasterProducts, mergeMasterProducts, updateMasterProduct } from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Master = Awaited<ReturnType<typeof listMasterProducts>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Master[] | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    listMasterProducts(supabase, search).then(
      (next) => active && setRows(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [search, version]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(query);
  }

  async function merge(into: Master, from: Master) {
    if (!window.confirm(`Merge "${from.name} ${from.size}" into "${into.name} ${into.size}"? Its shop listings move over. Old bills stay as they were.`)) return;
    setError(null);
    try {
      const moved = await mergeMasterProducts(supabase, into.id, from.id);
      setNotice(`Merged. ${moved} shop ${moved === 1 ? "listing" : "listings"} moved.`);
      setKeep(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  const kept = rows?.find((r) => r.id === keep);

  return (
    <>
      <h1 className="text-2xl font-semibold">Master catalog</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Each product appears once here; every shop that sells it has its own listing with its own price and stock.
        New items join a product by name and size. Merge duplicates (like &quot;Lays&quot; and &quot;Lay&apos;s&quot;) and record barcodes so
        shops can scan them.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">{notice}</p>}

      <form onSubmit={onSearch} className="flex gap-2">
        <input className={`${input} w-80`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or barcode" />
        <button type="submit" className="rounded-md bg-[#1A9E4B] px-3 py-1 text-sm font-semibold text-white">
          Search
        </button>
      </form>

      {kept && (
        <p className={`${card} text-sm`}>
          Keeping <strong>{kept.name} {kept.size}</strong>. Pick the duplicate to merge into it, or{" "}
          <button className="font-semibold text-[#1A9E4B]" onClick={() => setKeep(null)}>
            cancel
          </button>
          .
        </p>
      )}

      {!rows && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {rows && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Brand</th>
                <th className="p-3">Size</th>
                <th className="p-3">Barcode</th>
                <th className="p-3">Shops</th>
                <th className="p-3">Price</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <MasterRow
                  key={`${row.id}:${version}`}
                  row={row}
                  keep={kept ?? null}
                  onKeep={() => setKeep(row.id)}
                  onMerge={() => kept && merge(kept, row)}
                  onSaved={() => setVersion((v) => v + 1)}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function MasterRow({
  row,
  keep,
  onKeep,
  onMerge,
  onSaved,
  onError,
}: {
  row: Master;
  keep: Master | null;
  onKeep: () => void;
  onMerge: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState({ name: row.name, brand: row.brand ?? "", size: row.size, barcode: row.barcode ?? "" });
  const changed =
    draft.name !== row.name || draft.brand !== (row.brand ?? "") || draft.size !== row.size || draft.barcode !== (row.barcode ?? "");

  async function save() {
    try {
      await updateMasterProduct(supabase, row.id, { ...draft, brand: draft.brand || null, barcode: draft.barcode || null });
      onSaved();
    } catch (e) {
      onError(messageOf(e));
    }
  }

  return (
    <tr className={`border-t border-zinc-200 dark:border-zinc-800 ${keep?.id === row.id ? "bg-green-50 dark:bg-green-950" : ""}`}>
      <td className="p-2">
        <input className={`${input} w-56`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <span className="block text-xs text-zinc-500">{row.category_name ?? "No category"}</span>
      </td>
      <td className="p-2">
        <input className={`${input} w-28`} value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
      </td>
      <td className="p-2">
        <input className={`${input} w-20`} value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} />
      </td>
      <td className="p-2">
        <input
          className={`${input} w-36`}
          inputMode="numeric"
          value={draft.barcode}
          onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
          placeholder="8901234567890"
        />
      </td>
      <td className="p-2">{row.shops}</td>
      <td className="p-2 text-zinc-600 dark:text-zinc-400">
        {row.min_price_paise === null
          ? "—"
          : row.min_price_paise === row.max_price_paise
            ? formatPaise(row.min_price_paise)
            : `${formatPaise(row.min_price_paise)}–${formatPaise(row.max_price_paise ?? 0)}`}
      </td>
      <td className="space-x-3 whitespace-nowrap p-2 text-right">
        {changed && (
          <button onClick={save} className="text-xs font-semibold text-[#1A9E4B] hover:underline">
            Save
          </button>
        )}
        {!keep && (
          <button onClick={onKeep} className="text-xs font-semibold text-zinc-600 hover:underline dark:text-zinc-400">
            Merge…
          </button>
        )}
        {keep && keep.id !== row.id && (
          <button onClick={onMerge} className="text-xs font-semibold text-red-600 hover:underline">
            Merge into kept
          </button>
        )}
      </td>
    </tr>
  );
}
