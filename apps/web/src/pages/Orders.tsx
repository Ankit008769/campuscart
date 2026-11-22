import {
  ACCEPT_WINDOW_MS,
  ORDER_STATUS_LABEL,
  formatPaise,
  getOrder,
  isFinal,
  listMyOrders,
  orderSteps,
  transitionOrder,
  watchOrders,
  type OrderStatus,
} from '@campuscart/core';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { PLAY_URL } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function statusClass(status: OrderStatus) {
  if (status === 'delivered' || status === 'collected') return 'status active';
  if (status === 'rejected' || status === 'cancelled' || status === 'expired') return 'status removed';
  return 'status pending';
}

function PlacedNote() {
  return (
    <div className="notice">
      <strong>Order placed.</strong>
      <p>
        The shop has {ACCEPT_WINDOW_MS / 60000} minutes to accept it. This page updates by itself. For a notification when it’s accepted or ready, get the{' '}
        <a href={PLAY_URL} target="_blank" rel="noreferrer">
          Android app
        </a>
        .
      </p>
    </div>
  );
}

/** A student's orders, newest first, updating live as shops accept and pack them. */
export function Orders() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const userId = session?.user.id;
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof listMyOrders>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    listMyOrders(supabase, userId).then(setOrders, (e: unknown) => setError(messageOf(e)));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    return watchOrders(supabase, `student_id=eq.${userId}`, load);
  }, [userId, load]);

  if (!session) return <Navigate to="/login?redirect=/orders" replace />;
  return (
    <section>
      <span className="eyebrow">FROM THE SHOP TO YOUR DOOR</span>
      <div className="section-heading">
        <h1>My orders</h1>
        <button className="secondary small" onClick={load}>
          Refresh
        </button>
      </div>
      {params.get('placed') && <PlacedNote />}
      <p className="muted">Orders from the website and the app, for {session.user.email}.</p>
      {error ? (
        <p className="error">{error}</p>
      ) : !orders ? (
        <p>Loading orders…</p>
      ) : orders.length ? (
        orders.map((o) => (
          <Link key={o.id} to={`/order/${o.id}`} className="panel order-panel order-row">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  ORDER #{o.code} · {o.shops?.name}
                </span>
                <h2>{formatPaise(o.total_paise)}</h2>
              </div>
              <span className={statusClass(o.status)}>{ORDER_STATUS_LABEL[o.status]}</span>
            </div>
            <p className="muted">
              {when(o.placed_at)} · {o.mode === 'delivery' ? 'Delivery' : `Pickup, token #${o.token_no}`}
            </p>
          </Link>
        ))
      ) : (
        <div className="empty-state">
          Your first campus delivery is waiting to happen. <Link to="/shop">Browse the shops</Link>
        </div>
      )}
    </section>
  );
}

type Detail = Awaited<ReturnType<typeof getOrder>>;

export function OrderPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getOrder(supabase, id).then(setDetail, (e: unknown) => setError(messageOf(e)));
  }, [id]);

  useEffect(() => {
    if (!session) return;
    load();
    return watchOrders(supabase, `id=eq.${id}`, load);
  }, [session, id, load]);

  if (!session) return <Navigate to={`/login?redirect=/order/${id}`} replace />;
  if (error) return <p className="error">{error}</p>;
  if (!detail) return <p>Loading…</p>;

  const { order: o, deliveryOtp } = detail;
  const steps = orderSteps(o.mode);
  const reached = steps.indexOf(o.status);
  const ended = isFinal(o.status) && reached === -1;
  const delivery = o.delivery_fee_paise + o.small_cart_fee_paise + o.surcharge_paise;

  async function cancel() {
    if (!window.confirm('Cancel this order? The shop hasn’t accepted it yet, so there is nothing to pay.')) return;
    setBusy(true);
    try {
      await transitionOrder(supabase, { orderId: o.id, to: 'cancelled' });
      load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <Link className="back-link" to="/orders">
        ← My orders
      </Link>
      <h1>Your order</h1>
      {params.get('placed') && <PlacedNote />}
      <article className="panel order-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              ORDER #{o.code} · {o.shops?.name}
            </span>
            <h2>{formatPaise(o.total_paise)}</h2>
          </div>
          <span className={statusClass(o.status)}>{ORDER_STATUS_LABEL[o.status]}</span>
        </div>
        <p className="muted">
          {when(o.placed_at)} · Pay at handover by {o.pay_method === 'cash' ? 'cash' : 'UPI'}
        </p>

        {ended ? (
          <p className="error">
            {o.status === 'expired'
              ? 'It wasn’t accepted in time. Nothing to pay. Try again in a bit, or order from another shop.'
              : `${o.cancel_reason ? `${o.cancel_reason}. ` : ''}Nothing to pay.`}
          </p>
        ) : (
          <ol className="order-steps">
            {steps.map((step, i) => (
              <li key={step} className={i <= reached ? 'done' : ''}>
                {ORDER_STATUS_LABEL[step]}
                {step === 'accepted' && i <= reached && o.prep_minutes ? ` · ready in about ${o.prep_minutes} min` : ''}
              </li>
            ))}
          </ol>
        )}

        {!ended && o.mode === 'delivery' && deliveryOtp && !isFinal(o.status) && (
          <div className="notice">
            Delivery code: <strong>{deliveryOtp}</strong>
            <p>Share this code only after you have your items and have paid.</p>
          </div>
        )}
        {o.mode === 'pickup' && !ended && (
          <div className="notice">
            Pickup token: <strong>#{o.token_no}</strong>
            <p>Show it at {o.shops?.name} when your order is ready.</p>
          </div>
        )}
        {o.mode === 'delivery' && (
          <p>
            Delivering to <strong>{o.drop_points?.name}</strong>
            {o.room_note ? `, ${o.room_note}` : ''}
          </p>
        )}
        {o.shops?.phone && (
          <p>
            Questions? <a href={`tel:${o.shops.phone}`}>Call {o.shops.name}: {o.shops.phone}</a>
          </p>
        )}

        {o.order_items.map((i) => (
          <div className="total-row" key={i.id}>
            <span>
              {i.name_snapshot} × {i.qty}
            </span>
            <span>{formatPaise(i.price_paise_snapshot * i.qty)}</span>
          </div>
        ))}
        {o.mode === 'delivery' && (
          <div className="total-row">
            <span>Delivery</span>
            <span>{delivery ? formatPaise(delivery) : 'Free'}</span>
          </div>
        )}
        <div className="total-row">
          <span>Platform fee</span>
          <span>{formatPaise(o.platform_fee_paise)}</span>
        </div>
        {o.discount_paise > 0 && (
          <div className="total-row">
            <span>Coupon {o.coupon_code}</span>
            <span>−{formatPaise(o.discount_paise)}</span>
          </div>
        )}
        <div className="total-row grand-total">
          <span>{ended ? 'Nothing to pay' : 'Pay at handover'}</span>
          <strong>{ended ? formatPaise(0) : formatPaise(o.total_paise)}</strong>
        </div>

        {o.status === 'placed' && (
          <button className="secondary" disabled={busy} onClick={cancel}>
            {busy ? 'Cancelling…' : 'Cancel order'}
          </button>
        )}
      </article>
    </section>
  );
}
