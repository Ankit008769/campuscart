"use client";

import { listAllDropPoints, parseRupees, saveDropPoint, type DropPointInput } from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type DropPoint = Awaited<ReturnType<typeof listAllDropPoints>>[number];
type Kind = DropPointInput["kind"];

const KIND_LABEL: Record<Kind, string> = { hostel: "Hostel", department: "Department", other: "Other" };
const KINDS = Object.keys(KIND_LABEL) as Kind[];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export default function DropPointsPage() {
  const [points, setPoints] = useState<DropPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("hostel");
  const [gateOnly, setGateOnly] = useState(false);

  useEffect(() => {
    let active = true;
    listAllDropPoints(supabase).then(
      (next) => active && setPoints(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  async function save(point: DropPointInput) {
    setError(null);
    try {
      await saveDropPoint(supabase, point);
      setVersion((v) => v + 1);
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (await save({ name, kind, gateOnly, active: true, extraDeliveryFeePaise: 0 })) {
      setName("");
      setGateOnly(false);
    }
  }

  const toInput = (p: DropPoint): DropPointInput => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    gateOnly: p.gate_only,
    active: p.active,
    extraDeliveryFeePaise: p.extra_delivery_fee_paise,
    lat: p.lat,
    lng: p.lng,
  });

  /** "31.7084, 76.5274" as copied from Google Maps; blank clears it. */
  function saveLocation(point: DropPoint, text: string) {
    if (!text.trim()) {
      if (point.lat !== null) save({ ...toInput(point), lat: null, lng: null });
      return;
    }
    const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
    if (!match) return setError(`${point.name}: paste the location as "latitude, longitude", like 31.7084, 76.5274.`);
    const [lat, lng] = [Number(match[1]), Number(match[2])];
    if (lat !== point.lat || lng !== point.lng) save({ ...toInput(point), lat, lng });
  }

  function saveExtraFee(point: DropPoint, text: string) {
    const paise = text.trim() ? parseRupees(text) : 0;
    if (paise === null) return setError(`${point.name}: the extra fee is an amount in rupees, like 5.`);
    if (paise !== point.extra_delivery_fee_paise) save({ ...toInput(point), extraDeliveryFeePaise: paise });
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Drop points</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Where students can have orders delivered. Gate-only points (such as girls&apos; hostels) get orders at the
        reception instead of the room. A far drop point can cost extra per delivery. Switching a point off hides it
        from checkout; past orders keep it.
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <form onSubmit={onAdd} className={`${card} flex flex-wrap items-end gap-3`}>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input className={`${input} w-64`} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ambika Girls Hostel" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={gateOnly} onChange={(e) => setGateOnly(e.target.checked)} />
          Hand over at the gate
        </label>
        <button type="submit" className="rounded-md bg-[#1A9E4B] px-3 py-1.5 text-sm font-semibold text-white">
          Add drop point
        </button>
      </form>

      {!points && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {points && (
        <div className={`${card} overflow-x-auto p-0`}>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Gate only</th>
                <th className="p-3">Extra delivery fee (₹)</th>
                <th className="p-3">Location (lat, lng)</th>
                <th className="p-3">In checkout</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id} className={`border-t border-zinc-200 dark:border-zinc-800 ${point.active ? "" : "opacity-50"}`}>
                  <td className="p-3">{point.name}</td>
                  <td className="p-3">{KIND_LABEL[point.kind]}</td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`${point.name} hands over at the gate`}
                      checked={point.gate_only}
                      onChange={(e) => save({ ...toInput(point), gateOnly: e.target.checked })}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      className={`${input} w-20`}
                      inputMode="decimal"
                      aria-label={`${point.name} extra delivery fee in rupees`}
                      defaultValue={point.extra_delivery_fee_paise ? String(point.extra_delivery_fee_paise / 100) : ""}
                      placeholder="0"
                      onBlur={(e) => saveExtraFee(point, e.target.value)}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      className={`${input} w-48`}
                      aria-label={`${point.name} location`}
                      defaultValue={point.lat !== null && point.lng !== null ? `${point.lat}, ${point.lng}` : ""}
                      placeholder="31.7084, 76.5274"
                      onBlur={(e) => saveLocation(point, e.target.value)}
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`${point.name} shown in checkout`}
                      checked={point.active}
                      onChange={(e) => save({ ...toInput(point), active: e.target.checked })}
                    />
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
