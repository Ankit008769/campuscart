"use client";

import {
  addAllowedLogin,
  listAllowedLogins,
  listDeletionRequests,
  listShopsForAdmin,
  removeAllowedLogin,
  type StaffRole,
} from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type Login = Awaited<ReturnType<typeof listAllowedLogins>>[number];
type DeletionRequest = Awaited<ReturnType<typeof listDeletionRequests>>[number];
type Shop = Awaited<ReturnType<typeof listShopsForAdmin>>[number];

const ROLE_LABEL: Record<StaffRole, string> = {
  merchant_owner: "Shop owner",
  merchant_staff: "Shop staff",
  rider: "Rider",
  admin: "Admin",
};
const ROLES = Object.keys(ROLE_LABEL) as StaffRole[];

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const input =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const card = "rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";
const date = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function PeoplePage() {
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("merchant_owner");
  const [shopId, setShopId] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listAllowedLogins(supabase), listDeletionRequests(supabase), listShopsForAdmin(supabase)]).then(
      ([nextLogins, nextRequests, nextShops]) => {
        if (!active) return;
        setLogins(nextLogins);
        setRequests(nextRequests);
        setShops(nextShops);
      },
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [version]);

  const shopRole = role === "merchant_owner" || role === "merchant_staff";

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await addAllowedLogin(supabase, { email, role, shopId: shopRole ? shopId : null, note });
      setEmail("");
      setNote("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(login: Login) {
    if (!window.confirm(`Withdraw the approval for ${login.email}?`)) return;
    try {
      await removeAllowedLogin(supabase, login.email);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">People</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Approved sign-ins</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Students sign in with their @nith.ac.in account. Everyone else, such as shop owners with a Gmail, needs an
          approval here first. Shop roles get the shop app for their shop on their first sign-in.
        </p>

        <form onSubmit={onAdd} className={`${card} flex flex-wrap items-end gap-3`}>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              className={`${input} w-64`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="shop.owner@gmail.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          {shopRole && (
            <label className="flex flex-col gap-1 text-sm">
              Shop
              <select className={input} required value={shopId} onChange={(e) => setShopId(e.target.value)}>
                <option value="">Choose a shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            Note
            <input
              className={`${input} w-48`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-[#1A9E4B] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {adding ? "Adding…" : "Approve"}
          </button>
        </form>

        {!logins && !error && <p className="text-sm text-zinc-500">Loading…</p>}
        {logins?.length === 0 && <p className="text-sm text-zinc-500">No approvals yet.</p>}
        {logins && logins.length > 0 && (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Shop</th>
                  <th className="p-3">Note</th>
                  <th className="p-3">Added</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {logins.map((login) => (
                  <tr key={login.email} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3">{login.email}</td>
                    <td className="p-3">{ROLE_LABEL[login.role as StaffRole] ?? login.role}</td>
                    <td className="p-3">{login.shops?.name ?? "—"}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{login.note ?? ""}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">{date(login.created_at)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => onRemove(login)} className="text-xs font-semibold text-red-600 hover:underline">
                        Withdraw
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Account deletion requests</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The app has already wiped these people&apos;s phone numbers and hostel details and blocked their accounts. Past
          orders stay for the shops&apos; records. To remove the sign-in itself, delete the user under Authentication →
          Users in the Supabase dashboard.
        </p>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-500">No requests.</p>
        ) : (
          <div className={`${card} overflow-x-auto p-0`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Asked on</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3">{request.name || "—"}</td>
                    <td className="p-3">{request.email}</td>
                    <td className="p-3 text-zinc-600 dark:text-zinc-400">
                      {request.deletion_requested_at && date(request.deletion_requested_at)}
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
