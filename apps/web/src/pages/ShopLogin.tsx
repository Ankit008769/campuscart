import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';

/** Shops sign in with the ID and password from the CampusCart team, as in the app. */
export function ShopLogin() {
  const { session, signInWithLogin } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/partner" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithLogin(loginId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">FOR CAMPUS SHOPS</span>
        <h1>Take your orders from any screen.</h1>
        <p>New orders ring here while this page is open. For a ring even when your phone is locked, use the Campus Cart Android app with the same ID.</p>
        <div className="story-orbit">
          cc<span>SHOP</span>
        </div>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <h1>Shop sign-in</h1>
        <p className="muted">Use the ID and password the CampusCart team gave you.</p>
        <label>
          ID
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" placeholder="like foodplaza.gate2" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">
          A student? <Link to="/login">Sign in with Google instead</Link>
        </p>
      </form>
    </section>
  );
}
