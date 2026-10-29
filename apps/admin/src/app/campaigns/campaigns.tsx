"use client";

import {
  createBanner,
  listAllCategories,
  listAllDropPoints,
  listBanners,
  listCampaigns,
  listShopsForAdmin,
  sendCampaign,
  setBannerActive,
  type Audience,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Banner = Awaited<ReturnType<typeof listBanners>>[number];
type Campaign = Awaited<ReturnType<typeof listCampaigns>>[number];
type Option = { id: string; name: string };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const button = "rounded-md bg-[#1A9E4B] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function audienceLabel(dropPointName: string | null | undefined, batch: string | null): string {
  if (dropPointName) return `Students of ${dropPointName}`;
  if (batch) return `The 20${batch} batch`;
  return "Every student";
}

/** Everyone, one hostel or one batch. */
function AudiencePicker({ dropPoints, value, onChange }: { dropPoints: Option[]; value: Audience; onChange: (a: Audience) => void }) {
  const kind = value.dropPointId ? "hostel" : value.batch !== null ? "batch" : "all";
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        For
        <select
          className={input}
          value={kind}
          onChange={(e) =>
            onChange(
              e.target.value === "hostel"
                ? { dropPointId: dropPoints[0]?.id ?? null, batch: null }
                : e.target.value === "batch"
                  ? { dropPointId: null, batch: "" }
                  : { dropPointId: null, batch: null },
            )
          }
        >
          <option value="all">Every student</option>
          <option value="hostel">One hostel</option>
          <option value="batch">One batch</option>
        </select>
      </label>
      {kind === "hostel" && (
        <label className="flex flex-col gap-1">
          Hostel (their usual drop point)
          <select className={input} value={value.dropPointId ?? ""} onChange={(e) => onChange({ dropPointId: e.target.value, batch: null })}>
            {dropPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "batch" && (
        <label className="flex flex-col gap-1">
          Batch (two digits, e.g. 24)
          <input
            className={`${input} w-20`}
            inputMode="numeric"
            maxLength={2}
            value={value.batch ?? ""}
            onChange={(e) => onChange({ dropPointId: null, batch: e.target.value.replace(/\D/g, "") })}
          />
        </label>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [shops, setShops] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [dropPoints, setDropPoints] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [banner, setBanner] = useState({ title: "", body: "", link: "", ends: "" });
  const [bannerAudience, setBannerAudience] = useState<Audience>({ dropPointId: null, batch: null });
  const [push, setPush] = useState({ title: "", body: "" });
  const [pushAudience, setPushAudience] = useState<Audience>({ dropPointId: null, batch: null });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      listBanners(supabase),
      listCampaigns(supabase),
      listShopsForAdmin(supabase),
      listAllCategories(supabase),
      listAllDropPoints(supabase),
    ]).then(
      ([nextBanners, nextCampaigns, nextShops, nextCategories, nextPoints]) => {
        if (!active) return;
        setBanners(nextBanners);
        setCampaigns(nextCampaigns);
        setShops(nextShops);
        setCategories(nextCategories);
        setDropPoints(nextPoints.filter((p) => p.active));
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  const audienceError = (a: Audience) => (a.batch !== null && !/^\d{2}$/.test(a.batch) ? "Enter the batch as two digits, like 24." : null);
  const dropPointName = (id: string | null) => dropPoints.find((p) => p.id === id)?.name;

  async function onCreateBanner(event: FormEvent) {
    event.preventDefault();
    const problem = audienceError(bannerAudience);
    if (problem) return setError(problem);
    const [kind, id] = banner.link.split(":");
    setError(null);
    try {
      await createBanner(supabase, {
        title: banner.title,
        body: banner.body,
        shopId: kind === "shop" ? id : null,
        categoryId: kind === "category" ? id : null,
        // The last day is inclusive.
        endsAt: banner.ends ? new Date(new Date(`${banner.ends}T00:00:00`).getTime() + 24 * 3600_000).toISOString() : null,
        ...bannerAudience,
      });
      setBanner({ title: "", body: "", link: "", ends: "" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const problem = audienceError(pushAudience);
    if (problem) return setError(problem);
    const who = audienceLabel(dropPointName(pushAudience.dropPointId), pushAudience.batch);
    if (!window.confirm(`Send "${push.title}" to: ${who}? This can't be undone, and only 3 campaigns can go out a day.`)) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const reached = await sendCampaign(supabase, { ...push, ...pushAudience });
      setNotice(`Sent to ${reached} ${reached === 1 ? "student" : "students"}. Phones get it within a minute.`);
      setPush({ title: "", body: "" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">{notice}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Push message</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Goes to the phones of every student in the audience who allowed notifications. At most 3 a day, so students
          keep reading them.
        </p>
        <form onSubmit={onSend} className={`${card} flex flex-col gap-3 text-sm`}>
          <label className="flex flex-col gap-1">
            Title
            <input className={input} required maxLength={60} value={push.title} onChange={(e) => setPush({ ...push, title: e.target.value })} placeholder="Maggi at ₹20 tonight" />
          </label>
          <label className="flex flex-col gap-1">
            Message ({140 - push.body.length} letters left)
            <textarea className={input} required maxLength={140} rows={2} value={push.body} onChange={(e) => setPush({ ...push, body: e.target.value })} />
          </label>
          <AudiencePicker dropPoints={dropPoints} value={pushAudience} onChange={setPushAudience} />
          <button type="submit" disabled={sending} className={`${button} self-start`}>
            {sending ? "Sending…" : "Send push message"}
          </button>
        </form>
        {campaigns.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Sent</th>
                  <th className="p-3">Message</th>
                  <th className="p-3">For</th>
                  <th className="p-3">Students</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{when(c.sent_at)}</td>
                    <td className="p-3">
                      <span className="font-semibold">{c.title}</span>
                      <span className="block text-xs text-zinc-500">{c.body}</span>
                    </td>
                    <td className="p-3">{audienceLabel(c.drop_points?.name, c.batch)}</td>
                    <td className="p-3">{c.recipients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Home screen banners</h2>
        <form onSubmit={onCreateBanner} className={`${card} flex flex-col gap-3 text-sm`}>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              Title
              <input className={`${input} w-64`} required maxLength={60} value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Text (optional)
              <input className={input} maxLength={140} value={banner.body} onChange={(e) => setBanner({ ...banner, body: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              Tapping it opens
              <select className={input} value={banner.link} onChange={(e) => setBanner({ ...banner, link: e.target.value })}>
                <option value="">Nothing</option>
                <optgroup label="A shop">
                  {shops.map((s) => (
                    <option key={s.id} value={`shop:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="A category">
                  {categories.map((c) => (
                    <option key={c.id} value={`category:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Last day (optional)
              <input className={input} type="date" value={banner.ends} onChange={(e) => setBanner({ ...banner, ends: e.target.value })} />
            </label>
          </div>
          <AudiencePicker dropPoints={dropPoints} value={bannerAudience} onChange={setBannerAudience} />
          <button type="submit" className={`${button} self-start`}>
            Add banner
          </button>
        </form>
        {banners.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Banner</th>
                  <th className="p-3">Opens</th>
                  <th className="p-3">For</th>
                  <th className="p-3">Until</th>
                  <th className="p-3">On</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((b) => (
                  <tr key={b.id} className={`border-t border-zinc-200 dark:border-zinc-800 ${b.active ? "" : "opacity-50"}`}>
                    <td className="p-3">
                      <span className="font-semibold">{b.title}</span>
                      {b.body && <span className="block text-xs text-zinc-500">{b.body}</span>}
                    </td>
                    <td className="p-3">{b.shops?.name ?? b.categories?.name ?? "—"}</td>
                    <td className="p-3">{audienceLabel(b.drop_points?.name, b.batch)}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{b.ends_at ? when(b.ends_at) : "No end"}</td>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`${b.title} shown`}
                        checked={b.active}
                        onChange={() =>
                          setBannerActive(supabase, b.id, !b.active).then(
                            () => setVersion((v) => v + 1),
                            (e: unknown) => setError(messageOf(e)),
                          )
                        }
                      />
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
