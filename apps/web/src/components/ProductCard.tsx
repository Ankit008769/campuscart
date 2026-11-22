import { formatPaise } from '@campuscart/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useCart } from '../lib/cart';
import { photoUrl, useCatalog, type Product } from '../lib/catalog';

/** Quantity buttons for one size, or ADD when it isn't in the bag yet. */
export function QtyControl({ product, variantId, label }: { product: Product; variantId: string; label: string }) {
  const cart = useCart();
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return null;
  const qty = cart.qtyOf(variantId);
  const line = {
    variantId,
    productId: product.id,
    productName: product.name,
    label: variant.label,
    pricePaise: variant.pricePaise,
    imagePath: product.imagePath,
    shopId: product.shop.id,
    shopName: product.shop.name,
  };
  const canAdd = variant.inStock && product.shop.is_open;
  return qty ? (
    <div className="quantity-control" aria-label={`Quantity for ${label}`}>
      <button onClick={() => cart.set(line, qty - 1)} aria-label={`Remove one ${label}`}>
        −
      </button>
      <span aria-live="polite">{qty}</span>
      <button disabled={!canAdd} onClick={() => cart.set(line, qty + 1)} aria-label={`Add one ${label}`}>
        +
      </button>
    </div>
  ) : (
    <button className="add-button" disabled={!canAdd} onClick={() => cart.set(line, 1)} aria-label={`Add ${label}`}>
      ADD
    </button>
  );
}

export function ProductCard({ product: p }: { product: Product }) {
  const { favourites, toggleFavourite, alerts, toggleAlert, rules } = useCatalog();
  const firstInStock = p.variants.find((v) => v.inStock) ?? p.variants[0];
  const [variantId, setVariantId] = useState(firstInStock.id);
  const variant = p.variants.find((v) => v.id === variantId) ?? firstInStock;
  const saved = favourites.has(p.id);
  const soldOut = !p.variants.some((v) => v.inStock);
  const label = p.variants.length > 1 ? `${p.name}, ${variant.label}` : p.name;

  return (
    <article className="product-card">
      <div className="product-image">
        <Link to={`/product/${p.id}`}>
          <img
            src={photoUrl(p.imagePath)}
            alt={p.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/product-placeholder.svg';
            }}
          />
        </Link>
        <button
          className={`save-button ${saved ? 'saved' : ''}`}
          onClick={() => toggleFavourite(p.id).catch(() => {})}
          aria-label={`${saved ? 'Unsave' : 'Save'} ${p.name}`}>
          {saved ? '♥' : '♡'}
        </button>
        {soldOut && <span className="stock-badge">Sold out</span>}
        {!soldOut && !p.shop.is_open && <span className="stock-badge">Shop closed</span>}
      </div>
      <div className="product-info">
        <span className="delivery-chip">◷ {p.shop.prep_minutes ? `${p.shop.prep_minutes} MINS` : 'CAMPUS DELIVERY'}</span>
        <Link to={`/product/${p.id}`}>
          <h3>{p.name}</h3>
        </Link>
        <span className="shop-label">{p.shop.name}</span>
        {p.variants.length > 1 && (
          <select aria-label={`Size of ${p.name}`} value={variant.id} onChange={(e) => setVariantId(e.target.value)} className="variant-select">
            {p.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.inStock}>
                {v.label} · {formatPaise(v.pricePaise)}
                {v.inStock ? '' : ' (sold out)'}
              </option>
            ))}
          </select>
        )}
        <div className="product-bottom">
          <strong>{formatPaise(variant.pricePaise)}</strong>
          <QtyControl product={p} variantId={variant.id} label={label} />
        </div>
        {soldOut && (
          <button className="secondary small" onClick={() => toggleAlert(variant.id).catch(() => {})}>
            {alerts.has(variant.id) ? 'We’ll tell you when it’s back' : 'Notify me'}
          </button>
        )}
        <p className="delivery-note">Free delivery from {formatPaise(rules.smallCartLimitPaise)}</p>
      </div>
    </article>
  );
}
