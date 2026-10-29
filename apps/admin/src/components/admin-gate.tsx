"use client";

import { amIAdmin } from "@campuscart/core";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";

type Gate =
  | { state: "loading" }
  | { state: "signed-out"; error?: string }
  | { state: "not-admin"; email: string }
  | { state: "admin"; email: string };

const NAV = [
  { href: "/", label: "Live board" },
  { href: "/orders", label: "Orders" },
  { href: "/shops", label: "Shops and fees" },
  { href: "/catalog", label: "Catalog" },
  { href: "/collections", label: "Collections" },
  { href: "/drop-points", label: "Drop points" },
  { href: "/riders", label: "Riders" },
  { href: "/coupons", label: "Coupons" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/reports", label: "Reports" },
  { href: "/people", label: "People" },
] as const;

/** Shows the panel only to signed-in admins; everyone else gets the Google sign-in. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ state: "loading" });
  const pathname = usePathname();

  useEffect(() => {
    let active = true;
    const check = (session: Session | null) => {
      if (!session) {
        setGate({ state: "signed-out" });
        return;
      }
      const email = session.user.email ?? "";
      amIAdmin(supabase).then(
        (isAdmin) => active && setGate(isAdmin ? { state: "admin", email } : { state: "not-admin", email }),
        () => active && setGate({ state: "not-admin", email }),
      );
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      // supabase-js warns against calling it from inside this callback, so check on the next tick.
      setTimeout(() => active && check(session), 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setGate({ state: "signed-out", error: error.message });
  }

  if (gate.state === "loading") {
    return <Centered>Checking your sign-in…</Centered>;
  }

  if (gate.state === "signed-out") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">CampusCart admin</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Only approved admin accounts can open this panel.</p>
        <button
          onClick={signIn}
          className="rounded-lg bg-[#1A9E4B] px-4 py-2 font-semibold text-white hover:bg-[#158a40]"
        >
          Sign in with Google
        </button>
        {gate.error && <p className="text-sm text-red-600">{gate.error}</p>}
      </Centered>
    );
  }

  if (gate.state === "not-admin") {
    return (
      <Centered>
        <p className="text-sm">
          <strong>{gate.email}</strong> is not an admin account.
        </p>
        <button onClick={() => supabase.auth.signOut()} className="text-sm font-semibold text-[#1A9E4B] underline">
          Sign out
        </button>
      </Centered>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-200 bg-white px-8 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="font-semibold">CampusCart admin</span>
        <nav className="flex gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href
                  ? "font-semibold text-[#1A9E4B] underline underline-offset-4"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-sm text-zinc-500">{gate.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="text-sm font-semibold text-[#1A9E4B]">
          Sign out
        </button>
      </header>
      <main className="flex flex-1 flex-col gap-6 p-8">{children}</main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 p-8 text-center text-zinc-900 dark:bg-black dark:text-zinc-50">
      {children}
    </div>
  );
}
