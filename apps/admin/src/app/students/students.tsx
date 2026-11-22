"use client";

import { listStudentsForAdmin } from "@campuscart/core";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Student = Awaited<ReturnType<typeof listStudentsForAdmin>>[number];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const badge = (tone: "good" | "bad") =>
  `rounded-full px-2 py-0.5 text-xs ${tone === "good" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`;

/** Everyone who has signed in as a student, newest first, searchable by name or email. */
export default function StudentsPage() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    listStudentsForAdmin(supabase).then(
      (rows) => active && setStudents(rows),
      (e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load students."),
    );
    return () => {
      active = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (students ?? []).filter(
    (s) => !q || `${s.name} ${s.email ?? ""} ${s.phone ?? ""} ${s.drop_point ?? ""}`.toLowerCase().includes(q),
  );
  const ordered = students?.filter((s) => s.orders > 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Students</h1>
        <p className="text-sm text-zinc-500">
          {students ? `${students.length} registered · ${ordered} have ordered` : "Everyone who has signed in to order."}
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email (also phone or hostel)"
        className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!students && !error && <p className="text-sm text-zinc-500">Loading…</p>}
      {students && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Usual drop point</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Last order</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-3 py-2 font-medium">{s.name || "No name"}</td>
                  <td className="px-3 py-2">
                    {s.email ? (
                      <a className="text-green-700 underline" href={`mailto:${s.email}`}>
                        {s.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "—"}</td>
                  <td className="px-3 py-2">
                    {s.drop_point ?? "—"}
                    {s.room_note ? `, ${s.room_note}` : ""}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{day(s.joined_at)}</td>
                  <td className="px-3 py-2">
                    {s.orders}
                    {s.orders > 0 && <span className="text-zinc-500"> ({s.completed_orders} done)</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.last_order_at ? day(s.last_order_at) : "—"}</td>
                  <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                    {s.rider_status === "approved" && <span className={badge("good")}>Rider</span>}
                    {s.blocked && <span className={badge("bad")}>Blocked</span>}
                    {s.deletion_requested && <span className={badge("bad")}>Asked to delete</span>}
                    {!s.terms_accepted_at && <span className="text-xs text-zinc-500">terms not accepted</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">{students.length === 0 ? "No students yet." : "Nobody matches that search."}</p>
          )}
        </div>
      )}
    </div>
  );
}
