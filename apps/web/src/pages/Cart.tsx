import { calculateBill, formatPaise } from '@campuscart/core';
import { Link, useNavigate } from 'react-router-dom';

import { ShopBills } from '../components/ShopBills';
import { useAuth } from '../lib/auth';
import { linesByShop, useCart } from '../lib/cart';
import { useCatalog } from '../lib/catalog';

export function Cart() {
  const cart = useCart();
  const { session } = useAuth();
  const { rules } = useCatalog();
  const navigate = useNavigate();
  const bill = calculateBill(cart.subtotalPaise, 'delivery', rules);
  const delivery = bill.deliveryFeePaise + bill.smallCartFeePaise;

  return (
    <section>
      <span className="eyebrow">YOUR SHOPS, ONE BAG</span>
      <h1>Your shopping bag</h1>
      {!cart.count ? (
        <div className="empty-state">
          <h2>Your bag is waiting</h2>
          <Link className="button" to="/shop">
            Browse all shops
          </Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <ShopBills />
          <aside className="panel summary">
            <h2>Bill estimate</h2>
            {linesByShop(cart.lines).map((g) => (
              <div className="total-row" key={g.shopId}>
                <span>{g.shopName}</span>
                <strong>{formatPaise(g.subtotalPaise)}</strong>
              </div>
            ))}
            <div className="total-row">
              <span>Delivery</span>
              <strong>{delivery ? formatPaise(delivery) : 'Free'}</strong>
            </div>
            <div className="total-row">
              <span>Platform fee</span>
              <strong>{formatPaise(bill.platformFeePaise)}</strong>
            </div>
            <div className="total-row grand-total">
              <span>Total</span>
              <strong>{formatPaise(bill.totalPaise)}</strong>
            </div>
            <p className="muted">
              Delivery is free from {formatPaise(rules.smallCartLimitPaise)}, and pickup never pays it. Prices and stock are confirmed at
              checkout.
            </p>
            <button onClick={() => navigate(session ? '/checkout' : '/login?redirect=/checkout')}>Continue to checkout →</button>
            <Link to="/shop">Add more items</Link>
            <span className="delivery-note">Pay at handover: cash or UPI</span>
          </aside>
        </div>
      )}
    </section>
  );
}
