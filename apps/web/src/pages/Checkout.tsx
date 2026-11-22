import {
  deliverySurcharge,
  formatPaise,
  getCart,
  normalizeIndianMobile,
  placeCart,
  previewCart,
  previewCoupon,
  routeCart,
  updateMyProfile,
  type CartRoute,
  type OrderMode,
  type PayMethod,
} from '@campuscart/core';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { useCatalog } from '../lib/catalog';
import { groupedDropPoints, useDropPoint } from '../lib/location';
import { supabase } from '../lib/supabase';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/**
 * Delivery details, the confirmed bill and Place order, on one page. The bill comes from route_cart,
 * the same routing place_cart uses, so what is shown is what the database charges. One order is
 * made per shop, all or nothing, and each shop gets it in its app like any other order.
 */
export function Checkout() {
  const cart = useCart();
  const { session, profile, reloadProfile } = useAuth();
  const { rules } = useCatalog();
  const { dropPoints, dropPointId, setDropPointId } = useDropPoint();
  const navigate = useNavigate();

  const [mode, setMode] = useState<OrderMode>('delivery');
  const [roomNote, setRoomNote] = useState('');
  const [phone, setPhone] = useState('');
  const [payMethod, setPayMethod] = useState<PayMethod>('upi_at_handover');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountPaise: number } | null>(null);
  const [routes, setRoutes] = useState<CartRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (profile?.room_note) setRoomNote((current) => current || profile.room_note || '');
  }, [profile?.room_note]);

  const itemsKey = JSON.stringify(cart.items());
  useEffect(() => {
    if (!cart.count) return;
    let active = true;
    setRoutes(null);
    routeCart(supabase, JSON.parse(itemsKey), mode, mode === 'delivery' ? dropPointId : null).then(
      (next) => active && setRoutes(next),
      (e: unknown) => active && setError(messageOf(e)),
    );
    return () => {
      active = false;
    };
  }, [itemsKey, mode, dropPointId, cart.count]);

  if (!session) return <Navigate to="/login?redirect=/checkout" replace />;
  if (!cart.count && !placing) return <Navigate to="/cart" replace />;

  const preview = routes ? previewCart(routes, mode, rules) : null;
  const primary = preview?.shops[0];
  const point = dropPoints.find((p) => p.id === dropPointId);
  const surcharge = deliverySurcharge({
    mode,
    dropPointExtraPaise: point?.extra_delivery_fee_paise ?? 0,
    at: new Date(),
    nightSurchargePaise: rules.nightSurchargePaise ?? 0,
  });
  const discount = Math.min(coupon?.discountPaise ?? 0, primary?.subtotalPaise ?? 0);
  const toPay = preview ? preview.bill.totalPaise + surcharge - discount : 0;
  const delivery = preview ? preview.bill.deliveryFeePaise + preview.bill.smallCartFeePaise + surcharge : 0;
  const needsPhone = !profile?.phone;
  const sizeOf = (variantId: string) => {
    const label = cart.lines.find((line) => line.variantId === variantId)?.label;
    return label ? ` (${label})` : '';
  };
  const canPlace =
    !!preview && preview.problems.length === 0 && preview.shops.length > 0 && !placing && (mode === 'pickup' || !!dropPointId);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code || !primary) return;
    setError(null);
    try {
      const off = await previewCoupon(supabase, code, primary.shopId, primary.subtotalPaise);
      setCoupon({ code, discountPaise: off });
    } catch (e) {
      setCoupon(null);
      setError(messageOf(e));
    }
  }

  async function place() {
    if (!session) return;
    setError(null);
    // Shops call this number if something runs out; the database requires one on every order.
    if (needsPhone) {
      const normalized = normalizeIndianMobile(phone);
      if (!normalized) {
        setError('Enter a valid 10-digit Indian mobile number.');
        return;
      }
      try {
        await updateMyProfile(supabase, session.user.id, { phone: normalized });
        await reloadProfile();
      } catch (e) {
        setError(messageOf(e));
        return;
      }
    }
    setPlacing(true);
    try {
      const cartId = await placeCart(supabase, {
        items: cart.items(),
        mode,
        payMethod,
        dropPointId: mode === 'delivery' ? (dropPointId ?? undefined) : undefined,
        roomNote: mode === 'delivery' && roomNote.trim() ? roomNote.trim() : undefined,
        couponCode: coupon?.code,
      });
      cart.clear();
      const placed = await getCart(supabase, cartId).catch(() => null);
      navigate(placed?.orders.length === 1 ? `/order/${placed.orders[0].id}?placed=1` : '/orders?placed=1', { replace: true });
    } catch (e) {
      setError(messageOf(e));
      setPlacing(false);
    }
  }

  return (
    <section>
      <span className="eyebrow">ONE LAST LOOK</span>
      <h1>Ready when you are.</h1>
      <div className="checkout-layout">
        <div>
          <fieldset className="panel" disabled={placing}>
            <legend>How do you want it?</legend>
            <div className="choice-row" role="radiogroup" aria-label="Delivery or pickup">
              {(['delivery', 'pickup'] as const).map((m) => (
                <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? '' : 'secondary'} onClick={() => setMode(m)}>
                  {m === 'delivery' ? 'Deliver to me' : 'I’ll pick it up'}
                </button>
              ))}
            </div>
            {mode === 'delivery' ? (
              <>
                <label>
                  Drop point *
                  <select value={dropPointId ?? ''} onChange={(e) => setDropPointId(e.target.value || null)} required>
                    <option value="">Choose your hostel or campus spot</option>
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
                {point?.gate_only && <p className="muted">Hand-over is at the hostel reception.</p>}
                <label>
                  Room or landmark
                  <input value={roomNote} maxLength={120} onChange={(e) => setRoomNote(e.target.value)} placeholder="Room 214, or near the mess" />
                </label>
              </>
            ) : (
              <p className="muted">Collect it at the shop with your token number when it’s ready. No delivery charge.</p>
            )}
            {needsPhone && (
              <label>
                Mobile number *
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                />
                <small className="muted">The shop calls this number if something runs out or when they reach you. Saved to your profile.</small>
              </label>
            )}
            <label>
              Pay at handover with
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PayMethod)}>
                <option value="upi_at_handover">UPI</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <label>
              Coupon code
              <span className="coupon-row">
                <input
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value.toUpperCase());
                    setCoupon(null);
                  }}
                  placeholder="Enter coupon"
                />
                <button type="button" className="secondary" onClick={applyCoupon} disabled={!couponInput.trim() || !primary}>
                  Apply
                </button>
              </span>
            </label>
            {coupon && (
              <p className="notice">
                {coupon.code} applied: {formatPaise(coupon.discountPaise)} off {primary?.shopName}.
              </p>
            )}
          </fieldset>

          {!preview && !error && <p className="muted">Confirming prices and stock…</p>}
          {preview?.problems.map((problem) => (
            <p key={problem} className="error">
              {problem}. Remove it from your bag to order the rest. <Link to="/cart">Review bag</Link>
            </p>
          ))}
          {preview?.shops.map((s) => (
            <div className="panel order-panel" key={s.shopId}>
              <h2>{s.shopName}</h2>
              {s.lines.map((l) => (
                <div className="total-row" key={l.line}>
                  <span>
                    {l.product_name}
                    {sizeOf(l.variant_id)} × {l.qty}
                  </span>
                  <strong>{formatPaise((l.price_paise ?? 0) * l.qty)}</strong>
                </div>
              ))}
              <p className="muted">Sent to {s.shopName} as its own order. Pay the shop when it reaches you.</p>
            </div>
          ))}
        </div>

        <aside className="panel summary">
          <h2>Order summary</h2>
          <p>
            {mode === 'delivery' ? (point ? `Deliver to ${point.name}${roomNote.trim() ? `, ${roomNote.trim()}` : ''}` : 'Choose a drop point') : 'Pickup at the shop'}
          </p>
          {profile?.phone && (
            <p>
              <strong>Phone:</strong> {profile.phone} · <Link to="/profile">Edit</Link>
            </p>
          )}
          {preview && (
            <>
              <div className="total-row">
                <span>Items</span>
                <strong>{formatPaise(preview.bill.subtotalPaise)}</strong>
              </div>
              {mode === 'delivery' && (
                <div className="total-row">
                  <span>Delivery</span>
                  <strong>{delivery ? formatPaise(delivery) : 'Free'}</strong>
                </div>
              )}
              <div className="total-row">
                <span>Platform fee</span>
                <strong>{formatPaise(preview.bill.platformFeePaise)}</strong>
              </div>
              {discount > 0 && (
                <div className="total-row">
                  <span>{coupon?.code}</span>
                  <strong>−{formatPaise(discount)}</strong>
                </div>
              )}
              <div className="total-row grand-total">
                <span>Pay at handover</span>
                <strong>{formatPaise(toPay)}</strong>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button disabled={!canPlace} onClick={place}>
            {placing ? 'Placing order…' : mode === 'delivery' && !dropPointId ? 'Choose a drop point' : 'Place order →'}
          </button>
          <p className="muted">No online payment. Pay each shop its part in cash or UPI when you get it.</p>
        </aside>
      </div>
    </section>
  );
}
