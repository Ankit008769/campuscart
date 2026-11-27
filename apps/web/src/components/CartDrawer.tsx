import { calculateBill, formatPaise } from '@campuscart/core';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ShopBills } from './ShopBills';
import { feeShopId, useCart } from '../lib/cart';
import { useCatalog } from '../lib/catalog';

/** The bag slides in from the right, as on the old site. Totals are an estimate until checkout. */
export function CartDrawer({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cart = useCart();
  const { rulesFor } = useCatalog();
  // The fee-carrying shop's own free-delivery minimum, when it has one.
  const rules = rulesFor(feeShopId(cart.lines));
  const navigate = useNavigate();
  const bill = calculateBill(cart.subtotalPaise, 'delivery', rules);

  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      className="quick-cart"
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}>
      <div className="drawer-surface">
        <header>
          <h2>
            My cart <small>({cart.count} items)</small>
          </h2>
          <button className="text-button" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </header>
        <div className="drawer-body">
          {cart.count ? (
            <>
              <p className="cart-delivery-note">
                One checkout for every shop. Each shop sends its own part, and you pay when it arrives.
              </p>
              <ShopBills compact />
              <div className="drawer-bill">
                <h3>Bill estimate (delivery)</h3>
                <div>
                  <span>Items</span>
                  <strong>{formatPaise(bill.subtotalPaise)}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>{bill.smallCartFeePaise + bill.deliveryFeePaise ? formatPaise(bill.smallCartFeePaise + bill.deliveryFeePaise) : 'Free'}</strong>
                </div>
                <div>
                  <span>Platform fee</span>
                  <strong>{formatPaise(bill.platformFeePaise)}</strong>
                </div>
                <div>
                  <strong>Total</strong>
                  <strong>{formatPaise(bill.totalPaise)}</strong>
                </div>
                <p>Free delivery from {formatPaise(rules.smallCartLimitPaise)}. Pickup has no delivery charge. Confirmed at checkout.</p>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>Your cart is waiting</h2>
              <button
                onClick={() => {
                  onClose();
                  navigate('/shop');
                }}>
                Browse products
              </button>
            </div>
          )}
        </div>
        {cart.count > 0 && (
          <footer>
            <button
              onClick={() => {
                onClose();
                navigate('/cart');
              }}>
              <span>
                {formatPaise(bill.totalPaise)}
                <small>ESTIMATED TOTAL</small>
              </span>
              <strong>Review order →</strong>
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
