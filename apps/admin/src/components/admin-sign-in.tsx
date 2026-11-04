"use client";

import { authenticatorStatus, signInWithId, startAuthenticatorSetup, verifyAuthenticatorCode, type AuthenticatorSetup } from "@campuscart/core";
import { useEffect, useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
const input = "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button = "rounded-lg bg-[#1A9E4B] px-4 py-2 font-semibold text-white hover:bg-[#158a40] disabled:opacity-50";

/** Admin ID and password; AdminGate then asks for the Authenticator code. */
export function IdSignIn() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithId(supabase, loginId, password);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-72 flex-col gap-3">
      <input className={input} required autoComplete="username" placeholder="ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
      <input className={input} required type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className={button} disabled={busy}>
        Sign in
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

/** The Google Authenticator code, linking the app first if this admin hasn't yet. */
export function AuthenticatorStep() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const status = await authenticatorStatus(supabase);
      if (status.factorId) {
        if (active) setFactorId(status.factorId);
        return;
      }
      const next = await startAuthenticatorSetup(supabase);
      if (active) {
        setSetup(next);
        setFactorId(next.factorId);
      }
    })().catch((e: unknown) => active && setError(messageOf(e)));
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyAuthenticatorCode(supabase, factorId, code);
    } catch (e) {
      setError(messageOf(e));
      setCode("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-72 flex-col items-center gap-3">
      <h1 className="text-xl font-semibold">{setup ? "Link Google Authenticator" : "Enter your code"}</h1>
      {setup && (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Scan this in Google Authenticator, then type the 6-digit code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a one-off inline QR code, not a page image */}
          <img src={setup.qrCode} alt="QR code for Google Authenticator" width={200} height={200} className="rounded-lg bg-white p-2" />
          <p className="break-all text-xs text-zinc-500">Setup key: {setup.secret}</p>
        </>
      )}
      <input className={`${input} w-full`} required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      <button className={`${button} w-full`} disabled={busy || !factorId || code.length !== 6}>
        Continue
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
