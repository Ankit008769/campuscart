import { formatPaise } from '@campuscart/core';
import { Link } from 'react-router-dom';

import { Shop } from './Shop';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';

export function Home() {
  const { session, loading } = useAuth();
  const { rules } = useCatalog();
  return (
    <>
      <section className="quick-hero">
        <div>
          <span className="quick-kicker">NIT HAMIRPUR. YOUR CAMPUS SHOPS.</span>
          <h1>
            Campus food,
            <br />
            just a few taps away.
          </h1>
          <p>Delivered to your hostel, department or any campus spot. Or pick it up.</p>
          <Link className="hero-shop" to={session ? '/shop' : '/login'}>
            {session ? 'Shop now →' : 'Sign in to order →'}
          </Link>
        </div>
        <div className="quick-hero-art" aria-hidden="true">
          <span className="hero-spark">✦</span>
          <div className="quick-bag">
            <span>
              campus<span>cart</span>
            </span>
            <small>good things inside.</small>
          </div>
          <span className="hero-goods goods-one">🍔</span>
          <span className="hero-goods goods-two">🥤</span>
          <span className="hero-goods goods-three">🍜</span>
          <span className="hero-goods goods-four">☕</span>
        </div>
      </section>
      <div className="quick-promos">
        <Link to={session ? '/shop' : '/login'} className="quick-promo mint">
          <div>
            <h2>
              Burgers, momos,
              <br />
              chai and more
            </h2>
            <p>Every campus shop’s menu, in one place.</p>
            <span>Explore menus →</span>
          </div>
          <b aria-hidden="true">🛍️</b>
        </Link>
        <Link to={session ? '/shop?sort=low' : '/login'} className="quick-promo lemon">
          <div>
            <h2>
              Free delivery
              <br />
              from {formatPaise(rules.smallCartLimitPaise)}
            </h2>
            <p>Smaller orders pay a small delivery charge. Pickup is always free.</p>
            <span>Find your favourites →</span>
          </div>
          <b aria-hidden="true">🧺</b>
        </Link>
        <Link to={session ? '/orders' : '/login'} className="quick-promo lilac">
          <div>
            <h2>
              Pay when
              <br />
              you get it.
            </h2>
            <p>Cash or UPI to the shop at handover. Track every order live.</p>
            <span>Track my orders →</span>
          </div>
          <b aria-hidden="true">🛵</b>
        </Link>
      </div>
      {loading ? (
        <div className="empty-state">Stocking up your screen…</div>
      ) : session ? (
        <Shop embedded />
      ) : (
        <div className="empty-state">
          <h2>Sign in to see today’s menus</h2>
          <p>Use your @nith.ac.in Google account. Same account as the Campus Cart app.</p>
          <Link className="button" to="/login">
            Continue with Google
          </Link>
        </div>
      )}
    </>
  );
}
