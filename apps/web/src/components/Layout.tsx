import { formatPaise } from '@campuscart/core';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { CartDrawer } from './CartDrawer';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { groupedDropPoints, useDropPoint } from '../lib/location';

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.campuscart.student';

function LocationDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { dropPoints, dropPointId, setDropPointId } = useDropPoint();
  const [choice, setChoice] = useState(dropPointId ?? '');
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={dialog} className="location-dialog" onCancel={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDropPointId(choice || null);
          onClose();
        }}>
        <div className="section-heading">
          <h2>Where should we deliver?</h2>
          <button type="button" className="text-button" onClick={onClose} aria-label="Close location">
            ×
          </button>
        </div>
        <p className="muted">Pick your hostel, department or campus spot. You can change it at checkout.</p>
        <label>
          Drop point
          <select value={choice} onChange={(e) => setChoice(e.target.value)} required>
            <option value="">Choose a drop point</option>
            {groupedDropPoints(dropPoints).map(([group, points]) => (
              <optgroup key={group} label={group}>
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button>Save delivery location</button>
      </form>
    </dialog>
  );
}

function Navigation() {
  const { session, profile, signOut, loading } = useAuth();
  const cart = useCart();
  const { current } = useDropPoint();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  useEffect(() => setSearch(new URLSearchParams(location.search).get('q') ?? ''), [location.search]);

  const firstName = (profile?.name || session?.user.email || '').split(/[ @]/)[0];
  return (
    <>
      <header className="quick-header">
        <Link className="quick-brand" to="/">
          campus<span>cart</span>
        </Link>
        <button className="location-button" onClick={() => (session ? setShowLocation(true) : navigate('/login'))}>
          <strong>Delivery on campus</strong>
          <span>{current ? current.name : 'Select your delivery location'} ▾</span>
        </button>
        <form
          className="header-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams();
            const shop = new URLSearchParams(location.search).get('shop');
            if (shop) next.set('shop', shop);
            if (search.trim()) next.set('q', search.trim());
            navigate('/shop?' + next.toString());
          }}>
          <button aria-label="Search products" type="submit">
            ⌕
          </button>
          <input
            aria-label="Search products or shops"
            placeholder="Search for Maggi, momos, juice or shops"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch('');
                navigate('/shop');
              }}>
              ×
            </button>
          )}
        </form>
        <nav aria-label="Account navigation">
          {session ? (
            <details className="account-menu">
              <summary>{firstName || 'Account'} ▾</summary>
              <div>
                <Link to="/profile">My profile</Link>
                <Link to="/orders">My orders</Link>
                <Link to="/favorites">Saved items</Link>
                <a href={PLAY_URL} target="_blank" rel="noreferrer">
                  Get the Android app
                </a>
                <button className="text-button" onClick={() => signOut().then(() => navigate('/'))}>
                  Sign out
                </button>
              </div>
            </details>
          ) : loading ? null : (
            <Link className="login-link" to="/login">
              Login
            </Link>
          )}
          <button className="quick-cart-button" onClick={() => setShowCart(true)} aria-label={`Open cart, ${cart.count} items`}>
            <span aria-hidden="true">🛒</span>
            {cart.count ? (
              <span>
                {cart.count} items<small>{formatPaise(cart.subtotalPaise)}</small>
              </span>
            ) : (
              <span>My cart</span>
            )}
          </button>
        </nav>
      </header>
      <nav className="quick-subnav" aria-label="Store navigation">
        <Link to="/favorites">My favourites</Link>
        <Link to={session ? '/orders' : '/login'}>Track my orders</Link>
        <a href={PLAY_URL} target="_blank" rel="noreferrer">
          Get the Android app
        </a>
        <span>Pay when you get it: cash or UPI</span>
      </nav>
      {showCart && <CartDrawer onClose={() => setShowCart(false)} />}
      {showLocation && <LocationDialog onClose={() => setShowLocation(false)} />}
    </>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  // Close the account menu and start at the top on every new page.
  useEffect(() => {
    document.querySelectorAll('details.account-menu[open]').forEach((d) => d.removeAttribute('open'));
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="customer-app">
      <Navigation />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <strong>CampusCart NITH</strong>
        <span>Campus shops at NIT Hamirpur, delivered to your hostel.</span>
        <span>
          <Link to="/terms">Terms</Link> · Pay when you get it
        </span>
      </footer>
    </div>
  );
}
