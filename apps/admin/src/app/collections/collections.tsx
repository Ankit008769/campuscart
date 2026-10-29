"use client";

import {
  addToCollection,
  createCollection,
  listCollections,
  listMasterProducts,
  removeFromCollection,
  setCollectionActive,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Collection = Awaited<ReturnType<typeof listCollections>>[number];
type Master = Awaited<ReturnType<typeof listMasterProducts>>[number];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ends, setEnds] = useState("");

  useEffect(() => {
    let active = true;
    listCollections(supabase).then(
      (next) => active && setCollections(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);
  const run = (action: () => Promise<unknown>) =>
    action().then(reload, (e: unknown) => setError(messageOf(e)));

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createCollection(supabase, {
        title,
        subtitle,
        // The last day is inclusive.
        endsAt: ends ? new Date(new Date(`${ends}T00:00:00`).getTime() + 24 * 3600_000).toISOString() : null,
      });
      setTitle("");
      setSubtitle("");
      setEnds("");
    });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Collections</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Hand-picked rows on the student Home screen, like an exam night kit or fest merchandise. Students add items
        straight to their cart; CampusCart picks the shop. A product shows only while some open shop has it.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form onSubmit={onCreate} className={`${card} flex flex-wrap items-end gap-3 text-sm`}>
        <label className="flex flex-col gap-1">
          Title
          <input className={`${input} w-56`} required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam night kit" />
        </label>
        <label className="flex flex-col gap-1">
          Line under it (optional)
          <input className={`${input} w-72`} maxLength={120} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Last day (optional)
          <input className={input} type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </label>
        <button type="submit" className="rounded-md bg-[#1A9E4B] px-3 py-1.5 font-semibold text-white">
          Add collection
        </button>
      </form>

      {!collections && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {collections?.map((c) => (
        <section key={c.id} className={`${card} flex flex-col gap-2 ${c.active ? "" : "opacity-60"}`}>
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-semibold">
              {c.title}
              {c.subtitle && <span className="block text-xs font-normal text-zinc-500">{c.subtitle}</span>}
            </h2>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={c.active} onChange={() => run(() => setCollectionActive(supabase, c.id, !c.active))} />
              Shown
            </label>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            {c.collection_items.map((item) => (
              <li key={item.master_product_id} className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800">
                {item.master_products?.name} {item.master_products?.size}
                <button
                  aria-label={`Remove ${item.master_products?.name}`}
                  className="text-red-600"
                  onClick={() => run(() => removeFromCollection(supabase, c.id, item.master_product_id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <AddProduct onAdd={(masterId) => run(() => addToCollection(supabase, c.id, masterId))} onError={setError} />
        </section>
      ))}
    </>
  );
}

function AddProduct({ onAdd, onError }: { onAdd: (masterId: string) => void; onError: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Master[]>([]);

  async function search(event: FormEvent) {
    event.preventDefault();
    try {
      setHits((await listMasterProducts(supabase, query)).slice(0, 8));
    } catch (e) {
      onError(messageOf(e));
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <form onSubmit={search} className="flex gap-2">
        <input className={`${input} w-64`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a product to add" />
        <button type="submit" className="font-semibold text-[#1A9E4B]">
          Search
        </button>
      </form>
      {hits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hits.map((hit) => (
            <button
              key={hit.id}
              onClick={() => {
                onAdd(hit.id);
                setHits([]);
                setQuery("");
              }}
              className="rounded-full border border-[#1A9E4B] px-3 py-1 text-[#1A9E4B]"
            >
              + {hit.name} {hit.size}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
