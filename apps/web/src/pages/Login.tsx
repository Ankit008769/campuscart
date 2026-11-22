import { PRIVACY_POLICY_URL, TERMS_SUMMARY } from '@campuscart/core';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { rememberTermsTicked, useAuth } from '../lib/auth';
import { rememberAfterLogin, safePath } from '../lib/redirect';

export function Login() {
  const { session, signIn, error } = useAuth();
  const [params] = useSearchParams();
  const [agreed, setAgreed] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const next = safePath(params.get('redirect')) ?? '/';
  if (session) return <Navigate to={next} replace />;

  async function go(anyAccount: boolean) {
    if (!agreed) {
      setNudge(true);
      return;
    }
    setBusy(true);
    setFailed(null);
    rememberTermsTicked();
    rememberAfterLogin(next);
    try {
      // The page leaves for Google here and comes back signed in.
      await signIn({ anyAccount });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">CAMPUS CART NITH</span>
        <h1>Your campus shops, one sign-in away.</h1>
        <p>Order from the shops on campus. Delivered to your hostel or picked up, and paid when you get it.</p>
        <div className="story-orbit">
          cc<span>NIT HAMIRPUR</span>
        </div>
      </div>
      <div className="panel auth-form">
        <h1>Sign in</h1>
        <p className="muted">Use your @nith.ac.in Google account, the same one as in the Campus Cart app.</p>
        <label className="terms-tick">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              setNudge(false);
            }}
          />
          <span>
            I agree to the <Link to="/terms">Terms &amp; Conditions</Link> and{' '}
            <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
          </span>
        </label>
        {nudge && <p className="error">Please tick the box to agree to the terms first.</p>}
        <ul className="terms-summary muted">
          {TERMS_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button disabled={busy} onClick={() => go(false)}>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <button className="text-button" disabled={busy} onClick={() => go(true)}>
          Use another Google account
        </button>
        {(failed || error) && (
          <p className="error" role="alert">
            {failed || error}
          </p>
        )}
        <p className="muted">Run a shop? Take orders in the Campus Cart Android app, which rings for every new order.</p>
      </div>
    </section>
  );
}
