import { TERMS, TERMS_UPDATED, formatPaise, normalizeIndianMobile, updateMyProfile } from '@campuscart/core';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { ProductCard, QtyControl } from '../components/ProductCard';
import { useAuth } from '../lib/auth';
import { photoUrl, useCatalog } from '../lib/catalog';
import { groupedDropPoints, useDropPoint } from '../lib/location';
import { supabase } from '../lib/supabase';

export function Favorites() {
  const { session } = useAuth();
  const { products, favourites, loading } = useCatalog();
  if (!session) return <Navigate to="/login?redirect=/favorites" replace />;
  const saved = products.filter((p) => favourites.has(p.id));
  return (
    <section>
      <span className="eyebrow">SAVED FOR LATER</span>
      <h1>My favourites</h1>
      {loading ? (
        <p>Loading…</p>
      ) : saved.length ? (
        <div className="product-grid">
          {saved.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          Tap the ♡ on anything you like to find it here. <Link to="/shop">Browse the shops</Link>
        </div>
      )}
    </section>
  );
}

export function ProductDetails() {
  const { id } = useParams();
  const { products, loading, favourites, toggleFavourite } = useCatalog();
  const { session } = useAuth();
  if (!session) return <Navigate to={`/login?redirect=/product/${id}`} replace />;
  const p = products.find((x) => x.id === id);
  if (loading) return <p>Loading…</p>;
  if (!p) return <div className="empty-state">This item isn’t on any menu right now. <Link to="/shop">Browse the shops</Link></div>;
  const saved = favourites.has(p.id);
  return (
    <section>
      <Link className="back-link" to={`/shop?shop=${p.shop.id}`}>
        ← {p.shop.name}
      </Link>
      <div className="detail-layout">
        <img className="detail-image" src={photoUrl(p.imagePath, 'full')} alt={p.name} />
        <div className="panel">
          <span className="eyebrow">{p.shop.name}</span>
          <h1>{p.name}</h1>
          {p.description && <p className="product-description">{p.description}</p>}
          <p className="muted">
            {p.category}
            {p.isVeg === true ? ' · Veg' : p.isVeg === false ? ' · Non-veg' : ''}
            {p.shop.is_open ? ` · ready in about ${p.shop.prep_minutes} min` : ' · shop closed now'}
          </p>
          {p.variants.map((v) => (
            <div className="total-row" key={v.id}>
              <span>
                {v.label || p.name}
                {v.mrpPaise && v.mrpPaise > v.pricePaise ? <small className="block muted">MRP {formatPaise(v.mrpPaise)}</small> : null}
              </span>
              <span className="variant-buy">
                <strong>{v.inStock ? formatPaise(v.pricePaise) : 'Sold out'}</strong>
                <QtyControl product={p} variantId={v.id} label={`${p.name}${v.label ? `, ${v.label}` : ''}`} />
              </span>
            </div>
          ))}
          <button className="secondary" onClick={() => toggleFavourite(p.id).catch(() => {})}>
            {saved ? '♥ Saved' : '♡ Save for later'}
          </button>
          {p.photoCredit && (
            <details className="product-photo-credits">
              <summary>Photo credit</summary>
              <p>
                {p.photoCredit}
                {p.photoSourceUrl && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={p.photoSourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>
                  </>
                )}
              </p>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

export function Profile() {
  const { session, profile, reloadProfile } = useAuth();
  const { dropPoints } = useDropPoint();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roomNote, setRoomNote] = useState('');
  const [dropPointId, setDropPointId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setPhone(profile.phone ?? '');
    setRoomNote(profile.room_note ?? '');
    setDropPointId(profile.default_drop_point_id ?? '');
  }, [profile]);

  if (!session) return <Navigate to="/login?redirect=/profile" replace />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setMessage(null);
    const normalized = phone.trim() ? normalizeIndianMobile(phone) : null;
    if (phone.trim() && !normalized) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    try {
      await updateMyProfile(supabase, session.user.id, {
        name: name.trim(),
        phone: normalized,
        roomNote: roomNote.trim() || null,
        defaultDropPointId: dropPointId || null,
      });
      await reloadProfile();
      setMessage('Saved. The app shows the same details.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  return (
    <form className="panel auth-form standalone" onSubmit={save}>
      <span className="eyebrow">YOUR ACCOUNT</span>
      <h1>My profile</h1>
      <p className="muted">{session.user.email}</p>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <label>
        Mobile number
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" />
      </label>
      <label>
        Usual drop point
        <select value={dropPointId} onChange={(e) => setDropPointId(e.target.value)}>
          <option value="">None</option>
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
      <label>
        Room or landmark
        <input value={roomNote} onChange={(e) => setRoomNote(e.target.value)} maxLength={120} />
      </label>
      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <button>Save</button>
      <p className="muted">
        <Link to="/terms">Terms &amp; Conditions</Link>
      </p>
    </form>
  );
}

export function Terms() {
  return (
    <section className="panel terms-page">
      <span className="eyebrow">LAST UPDATED {TERMS_UPDATED.toUpperCase()}</span>
      <h1>Terms &amp; Conditions</h1>
      {TERMS.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <ul>
            {section.points.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
