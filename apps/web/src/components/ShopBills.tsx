import { formatPaise } from '@campuscart/core';
import { Link } from 'react-router-dom';

import { linesByShop, useCart } from '../lib/cart';
import { photoUrl } from '../lib/catalog';

/** The bag, one section per shop, with quantity buttons. */
export function ShopBills({ compact = false }: { compact?: boolean }) {
  const cart = useCart();
  return (
    <div className="shop-bills">
      {linesByShop(cart.lines).map((g) => (
        <section className="shop-bill panel" key={g.shopId} aria-label={`${g.shopName} items`}>
          <header className="shop-bill-heading">
            <div>
              <span className="eyebrow">FROM</span>
              <h2>{g.shopName}</h2>
            </div>
            <span className="status pending">{formatPaise(g.subtotalPaise)}</span>
          </header>
          {g.lines.map((l) => {
            const name = l.label ? `${l.productName} (${l.label})` : l.productName;
            const line = { ...l };
            return (
              <div className={compact ? 'drawer-item' : 'cart-row'} key={l.variantId}>
                <img src={photoUrl(l.imagePath)} alt={l.productName} />
                <div className="cart-item-details">
                  <Link to={`/product/${l.productId}`}>{name}</Link>
                  <strong className="block">{formatPaise(l.pricePaise)} each</strong>
                  <button className="text-button danger" onClick={() => cart.set(line, 0)}>
                    Remove
                  </button>
                </div>
                <div className="quantity-control">
                  <button aria-label={`Remove one ${name}`} onClick={() => cart.set(line, l.qty - 1)}>
                    −
                  </button>
                  <span>{l.qty}</span>
                  <button aria-label={`Add one ${name}`} onClick={() => cart.set(line, l.qty + 1)}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
