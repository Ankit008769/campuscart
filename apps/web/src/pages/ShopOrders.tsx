import {
  ACCEPT_WINDOW_MS,
  formatPaise,
  listShopOrders,
  loginIdOf,
  printFileLink,
  removeOrderItems,
  transitionOrder,
  watchCatalog,
  watchOrders,
  type OrderStatus,
} from '@campuscart/core';
import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';
import { useOrderAlarm } from '../lib/shop-alarm';
import { supabase } from '../lib/supabase';

type Order = Awaited<ReturnType<typeof listShopOrders>>[number];
type MyShop = { id: string; name: string; is_open: boolean; role: 'owner' | 'counter' };

// The same tabs, choices and reasons as the shop app's Orders board.
const TABS: { name: string; statuses: OrderStatus[] }[] = [
  { name: 'New', statuses: ['placed'] },
  { name: 'Preparing', statuses: ['accepted'] },
  { name: 'Ready', statuses: ['ready', 'out_for_delivery'] },
];
const PREP_CHOICES = [5, 10, 15];
const REJECT_REASONS = ['Item out of stock', 'Closing now', 'Too busy right now'];
const CANCEL_REASONS = ['Item out of stock', 'Accepted by mistake', 'Closing now', 'Cannot make it now'];
const PAY_LABEL = { cash: 'cash', upi_at_handover: 'UPI' } as const;
const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

async function loadMyShops(userId: string): Promise<MyShop[]> {
  const { data, error } = await supabase.from('shop_staff').select('role, shops (id, name, is_open)').eq('profile_id', userId);
  if (error) throw error;
  return data.flatMap((row) => (row.shops ? [{ ...row.shops, role: row.role }] : [])).sort((a, b) => a.name.localeCompare(b.name));
}

/** The shop's Orders board on the website: every outlet of this login, live, ringing for new orders. */
export function ShopOrders() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const signedInAs = loginIdOf(session?.user.email) ?? session?.user.email;
  const [shops, setShops] = useState<MyShop[] | undefined>(undefined);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingOpen, setSavingOpen] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const alarm = useOrderAlarm(orders.filter((o) => o.status === 'placed').map((o) => o.id));

  useEffect(() => {
    if (!userId) return;
    loadMyShops(userId).then(setShops, (e: unknown) => setError(messageOf(e, 'Could not load your shop.')));
  }, [userId]);

  // Open/closed set from the app or another browser shows here at once.
  useEffect(() => {
    if (!userId) return;
    return watchCatalog(supabase, () => {
      loadMyShops(userId).then(setShops, () => {});
    });
  }, [userId]);

  const shopIds = shops?.map((s) => s.id).join(',') ?? '';
  useEffect(() => {
    if (!shopIds) return;
    const ids = shopIds.split(',');
    let active = true;
    const load = () =>
      listShopOrders(supabase, ids).then(
        (next) => active && setOrders(next),
        (e: unknown) => active && setError(messageOf(e, 'Could not load orders.')),
      );
    load();
    const stops = ids.map((id) => watchOrders(supabase, `shop_id=eq.${id}`, load));
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [shopIds]);

  // Keep the "accept within" countdowns moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  async function setOpen(shop: MyShop, isOpen: boolean) {
    setSavingOpen(shop.id);
    setError(null);
    const { data, error: saveError } = await supabase.from('shops').update({ is_open: isOpen }).eq('id', shop.id).select('is_open').single();
    if (saveError) setError(saveError.message);
    else setShops((prev) => prev?.map((s) => (s.id === shop.id ? { ...s, is_open: data.is_open } : s)));
    setSavingOpen(null);
  }

  if (shops === undefined) return <p>{error ?? 'Loading your shop…'}</p>;
  if (shops.length === 0) {
    return (
      <div className="empty-state">
        <h2>This ID isn’t linked to a shop yet</h2>
        <p>Ask the CampusCart team to add {signedInAs} to your shop, then sign in again.</p>
      </div>
    );
  }

  const several = shops.length > 1;
  const visible = orders.filter((o) => TABS[tab].statuses.includes(o.status));

  return (
    <section className="shop-board">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR ORDERS</span>
          <h1>{several ? 'Orders' : shops[0].name}</h1>
          {several && <p className="muted">Orders from {shops.map((s) => s.name).join(', ')} all come here. Each card says which outlet it is for.</p>}
        </div>
        <span className="role-badge">Signed in as {signedInAs}</span>
      </div>

      {alarm.blocked && (
        <button className="sound-button" onClick={alarm.enable}>
          🔔 Turn on the order ring for this page
        </button>
      )}
      {alarm.ringing && (
        <button
          className="alarm-banner"
          onClick={() => {
            alarm.silence();
            setTab(0);
          }}>
          <strong>New order! Click to stop the ringing</strong>
          <span>Accept or reject it within {ACCEPT_WINDOW_MS / 60000} minutes, or it is cancelled.</span>
        </button>
      )}

      <div className="panel open-panel">
        {shops.map((shop) => (
          <label key={shop.id} className="open-row">
            <span>
              <strong>{several ? shop.name : 'Accepting orders'}</strong>{' '}
              <span className={`status ${shop.is_open ? 'active' : 'removed'}`}>{shop.is_open ? 'Open' : 'Closed'}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={shop.is_open}
              disabled={savingOpen === shop.id}
              onChange={(e) => setOpen(shop, e.target.checked)}
              aria-label={`${shop.name} accepting orders`}
            />
          </label>
        ))}
      </div>

      <div className="board-tabs" role="tablist">
        {TABS.map((t, i) => (
          <button key={t.name} role="tab" aria-selected={tab === i} className={tab === i ? '' : 'secondary'} onClick={() => setTab(i)}>
            {t.name} ({orders.filter((o) => t.statuses.includes(o.status)).length})
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="empty-state">
          {tab === 0
            ? `No new orders. New ones ring here; accept within ${ACCEPT_WINDOW_MS / 60000} minutes or they are cancelled.`
            : 'Nothing here right now.'}
        </div>
      ) : (
        visible.map((order) => (
          <OrderCard key={order.id} order={order} outlet={several ? order.shops?.name : undefined} now={now} onError={setError} onHandled={alarm.handled} />
        ))
      )}
    </section>
  );
}

function OrderCard({
  order,
  outlet,
  now,
  onError,
  onHandled,
}: {
  order: Order;
  outlet?: string;
  now: number;
  onError: (message: string | null) => void;
  onHandled: (orderId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'none' | 'rejecting' | 'cancelling' | 'removing'>('none');
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [code, setCode] = useState('');

  const placedAt = Date.parse(order.released_at ?? order.placed_at);
  const placedAgoMin = Math.max(0, Math.floor((now - placedAt) / 60000));
  const acceptLeftSec = Math.max(0, Math.round((ACCEPT_WINDOW_MS - (now - placedAt)) / 1000));
  const cancellable = order.status === 'accepted' || order.status === 'ready';
  const canRemoveItems = (order.status === 'placed' || order.status === 'accepted') && order.order_items.length > 1;

  async function move(to: OrderStatus, extra: { note?: string; code?: string; prepMinutes?: number } = {}) {
    if (to === 'accepted' || to === 'rejected') onHandled(order.id);
    setBusy(true);
    onError(null);
    try {
      await transitionOrder(supabase, { orderId: order.id, to, ...extra });
      setMode('none');
    } catch (e) {
      onError(messageOf(e, 'Could not update the order.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeMissing() {
    setBusy(true);
    onError(null);
    try {
      await removeOrderItems(supabase, order.id, [...missing]);
      setMissing(new Set());
      setMode('none');
    } catch (e) {
      onError(messageOf(e, 'Could not change the order.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel order-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            #{order.token_no} · {order.mode === 'delivery' ? 'DELIVERY' : 'PICKUP'}
            {outlet ? ` · ${outlet.toUpperCase()}` : ''}
          </span>
          <h2>Collect {formatPaise(order.total_paise)} by {PAY_LABEL[order.pay_method]}</h2>
        </div>
        {order.status === 'placed' ? (
          <span className="status removed">{acceptLeftSec > 0 ? `Accept within ${Math.floor(acceptLeftSec / 60)}:${String(acceptLeftSec % 60).padStart(2, '0')}` : 'Expiring'}</span>
        ) : (
          <span className="status pending">{placedAgoMin === 0 ? 'just now' : `${placedAgoMin} min ago`}</span>
        )}
      </div>

      <p>
        <strong>{order.profiles?.name || 'Student'}</strong>
        {order.mode === 'delivery' ? ` · ${order.drop_points?.name ?? ''}${order.room_note ? `, ${order.room_note}` : ''}` : ''}
        {order.profiles?.phone && (
          <>
            {' '}
            · <a href={`tel:${order.profiles.phone}`}>Call {order.profiles.phone}</a>
          </>
        )}
      </p>
      {order.mode === 'delivery' && order.drop_points?.gate_only && <p className="muted">Hand over at the hostel reception.</p>}
      {order.rider && order.status !== 'placed' && (
        <p className="muted">
          Rider: {order.rider.name || 'CampusCart rider'}
          {order.rider.phone && (
            <>
              {' '}
              · <a href={`tel:${order.rider.phone}`}>Call rider</a>
            </>
          )}
        </p>
      )}

      {mode === 'removing' ? (
        <div className="notice">
          <strong>Tick what you don’t have</strong>
          {order.order_items.map((item) => (
            <label key={item.id} className="tick-row">
              <input
                type="checkbox"
                checked={missing.has(item.id)}
                onChange={() =>
                  setMissing((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
              />
              {item.qty} × {item.name_snapshot}
            </label>
          ))}
          <p className="muted">
            {missing.size >= order.order_items.length
              ? `To drop every item, ${order.status === 'placed' ? 'reject' : 'cancel'} the order instead.`
              : 'The student keeps the rest at the lower price and is told right away. These items are also marked out of stock.'}
          </p>
          <div className="button-row">
            <button disabled={busy || missing.size === 0 || missing.size >= order.order_items.length} onClick={removeMissing}>
              Remove {missing.size || ''} {missing.size === 1 ? 'item' : 'items'}
            </button>
            <button className="secondary" onClick={() => setMode('none')}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          {order.order_items.map((item) => (
            <div className="total-row" key={item.id}>
              <span>
                {item.qty} × {item.name_snapshot}
              </span>
              <span>{formatPaise(item.price_paise_snapshot * item.qty)}</span>
            </div>
          ))}
          {canRemoveItems && (
            <button className="text-button" onClick={() => setMode('removing')}>
              Some items not in stock?
            </button>
          )}
        </>
      )}

      {order.print_jobs &&
        (order.print_jobs.file_deleted_at ? (
          <p className="muted">The PDF has been deleted.</p>
        ) : (
          <button
            className="text-button"
            onClick={() => {
              const path = order.print_jobs?.file_path;
              if (!path) return;
              printFileLink(supabase, path).then(
                (url) => window.open(url, '_blank', 'noopener'),
                (e: unknown) => onError(messageOf(e, 'Could not open the PDF.')),
              );
            }}>
            Open the PDF to print ({order.print_jobs.double_sided ? 'both sides' : 'one side'})
          </button>
        ))}

      {order.status === 'placed' && mode === 'none' && (
        <div className="button-row">
          {PREP_CHOICES.map((minutes) => (
            <button key={minutes} disabled={busy} onClick={() => move('accepted', { prepMinutes: minutes })}>
              Accept · {minutes} min
            </button>
          ))}
          <button className="secondary danger" disabled={busy} onClick={() => setMode('rejecting')}>
            Reject
          </button>
        </div>
      )}
      {mode === 'rejecting' && (
        <div className="button-row">
          {REJECT_REASONS.map((reason) => (
            <button key={reason} className="secondary danger" disabled={busy} onClick={() => move('rejected', { note: reason })}>
              {reason}
            </button>
          ))}
          <button className="secondary" onClick={() => setMode('none')}>
            Back
          </button>
        </div>
      )}

      {order.status === 'accepted' && mode === 'none' && (
        <div className="button-row">
          <button disabled={busy} onClick={() => move('ready')}>
            Mark packed and ready
          </button>
        </div>
      )}
      {order.status === 'ready' && order.mode === 'delivery' && mode === 'none' && (
        <div className="button-row">
          <button disabled={busy} onClick={() => move('out_for_delivery')}>
            {order.rider ? 'Handed to the rider' : 'Out for delivery'}
          </button>
        </div>
      )}
      {order.status === 'out_for_delivery' && order.rider_id && <p className="muted">With the rider. They finish it with the student’s code.</p>}
      {((order.status === 'out_for_delivery' && !order.rider_id) || (order.status === 'ready' && order.mode === 'pickup')) && mode === 'none' && (
        <div className="button-row">
          <input
            className="code-input"
            value={code}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder={order.mode === 'delivery' ? "Student's 4-digit code" : 'Token number'}
          />
          <button disabled={busy || code.length === 0} onClick={() => move(order.mode === 'delivery' ? 'delivered' : 'collected', { code })}>
            {order.mode === 'delivery' ? 'Delivered' : 'Handed over'}
          </button>
        </div>
      )}

      {cancellable && mode === 'cancelling' && (
        <div className="notice">
          <strong>Why are you cancelling?</strong>
          <p className="muted">
            The student is told right away, with this reason, and pays nothing.
            {order.status === 'accepted' && order.order_items.length > 1 ? ' Only one item ran out? Use “Some items not in stock?” instead and keep the order.' : ''}
          </p>
          <div className="button-row">
            {CANCEL_REASONS.map((reason) => (
              <button key={reason} className="secondary danger" disabled={busy} onClick={() => move('cancelled', { note: reason })}>
                {reason}
              </button>
            ))}
            <button className="secondary" onClick={() => setMode('none')}>
              Keep the order
            </button>
          </div>
        </div>
      )}
      {cancellable && mode === 'none' && (
        <button className="text-button danger" onClick={() => setMode('cancelling')}>
          Cancel this order
        </button>
      )}
    </article>
  );
}
