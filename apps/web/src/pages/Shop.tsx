import { buyAgain, describeShopHours, parseShopHours } from '@campuscart/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ProductCard } from '../components/ProductCard';
import { useCatalog, type Product } from '../lib/catalog';
import { supabase } from '../lib/supabase';

type Tile = { name: string; count: number };

function CategoryCarousel({ tiles, category, shop }: { tiles: Tile[]; category: string; shop: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => setEdges({ previous: el.scrollLeft > 2, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [category, shop, tiles.length]);
  const move = (direction: number) => track.current?.scrollBy({ left: direction * Math.max(120, track.current.clientWidth * 0.8), behavior: 'smooth' });
  const link = (c?: string) => '/shop?' + new URLSearchParams({ ...(c ? { category: c } : {}), ...(shop ? { shop } : {}) }).toString();
  return (
    <nav className="category-carousel" aria-label="Product categories">
      <button type="button" className="category-arrow" aria-label="Previous categories" disabled={!edges.previous} onClick={() => move(-1)}>
        ‹
      </button>
      <div className="menu-category-bar" ref={track}>
        <Link className={!category ? 'selected' : ''} aria-current={!category ? 'page' : undefined} to={link()}>
          All items
        </Link>
        {tiles.map((c) => (
          <Link key={c.name} className={category === c.name ? 'selected' : ''} aria-current={category === c.name ? 'page' : undefined} to={link(c.name)}>
            {c.name}
            <span>{c.count}</span>
          </Link>
        ))}
      </div>
      <button type="button" className="category-arrow" aria-label="Next categories" disabled={!edges.next} onClick={() => move(1)}>
        ›
      </button>
    </nav>
  );
}

function BuyAgain() {
  const { products } = useCatalog();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    buyAgain(supabase).then((rows) => setIds([...new Set(rows.map((r) => r.product_id))]), () => setIds([]));
  }, []);
  const items = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  if (!items.length) return null;
  return (
    <section className="product-shelf">
      <div className="shelf-heading">
        <h2>Buy again</h2>
        <Link to="/orders">Your orders →</Link>
      </div>
      <div className="product-grid quick-shelf">
        {items.slice(0, 6).map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function closedNote(value: Parameters<typeof parseShopHours>[0]) {
  const hours = parseShopHours(value);
  return hours ? `Closed · ${describeShopHours(hours)}` : 'Closed for now';
}

const matches = (p: Product, q: string) => `${p.name} ${p.category} ${p.shop.name}`.toLowerCase().includes(q.toLowerCase());
const lowestPrice = (p: Product) => Math.min(...p.variants.map((v) => v.pricePaise));

/** Every shop's menu, with the old site's shop picker, category bar, search and sort. */
export function Shop({ embedded = false }: { embedded?: boolean }) {
  const { shops, products, ratings, loading, error, reload } = useCatalog();
  const [params, setParams] = useSearchParams();
  const search = embedded ? '' : (params.get('q') ?? '');
  const shop = embedded ? '' : (params.get('shop') ?? '');
  const category = embedded ? '' : (params.get('category') ?? '');
  const sort = embedded ? 'az' : (params.get('sort') ?? 'az');
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const inShop = useMemo(() => products.filter((p) => !shop || p.shop.id === shop), [products, shop]);
  const tiles = useMemo(() => {
    const byName = new Map<string, { count: number; sort: number }>();
    for (const p of inShop) {
      const t = byName.get(p.category) ?? { count: 0, sort: p.categorySort };
      t.count++;
      byName.set(p.category, t);
    }
    return [...byName.entries()].sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0])).map(([name, t]) => ({ name, count: t.count }));
  }, [inShop]);

  const list = useMemo(() => {
    const filtered = inShop.filter((p) => (!category || p.category === category) && (!search || matches(p, search)));
    // Open shops and in-stock items first, then the chosen order.
    const rank = (p: Product) => (p.shop.is_open ? 0 : 2) + (p.variants.some((v) => v.inStock) ? 0 : 1);
    return filtered.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (sort === 'low' ? lowestPrice(a) - lowestPrice(b) : sort === 'high' ? lowestPrice(b) - lowestPrice(a) : a.name.localeCompare(b.name)),
    );
  }, [inShop, category, search, sort]);

  const groups = embedded
    ? tiles.map((t) => ({ id: t.name, name: t.name, items: list.filter((p) => p.category === t.name) }))
    : [
        {
          id: 'all',
          name: search ? `Results for “${search}”` : category || (shop ? (shops.find((s) => s.id === shop)?.name ?? 'Products') : 'All products'),
          items: list,
        },
      ];

  return (
    <section className="quick-market">
      <section className="shop-picker-section" id="choose-shop">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR CAMPUS SHOPS</span>
            <h2>Your campus shops</h2>
            <p className="muted">Pick a shop or browse them all. One checkout; each shop sends its own part.</p>
          </div>
          <Link to="/shop">Browse all products →</Link>
        </div>
        <div className="shop-picker-list">
          <Link className={`shop-picker-option ${!shop ? 'selected' : ''}`} to="/shop">
            All shops
          </Link>
          {shops.map((s) => {
            const r = ratings.get(s.id);
            return (
              <Link key={s.id} className={`shop-picker-option ${shop === s.id ? 'selected' : ''}`} to={`/shop?shop=${s.id}`}>
                <strong>{s.name}</strong>
                {r && r.ratings >= 3 && (
                  <small>
                    ★ {r.average.toFixed(1)} · {r.ratings} ratings
                  </small>
                )}
                <small>{s.is_open ? `Open · ready in about ${s.prep_minutes} min` : closedNote(s.hours)}</small>
              </Link>
            );
          })}
        </div>
      </section>

      {embedded && <BuyAgain />}
      {tiles.length > 0 && <CategoryCarousel tiles={tiles} category={category} shop={shop} />}

      {!embedded && (
        <div className="quick-filter">
          <p>
            {list.length} products{' '}
            {search && (
              <>
                matching <strong>{search}</strong>
              </>
            )}
          </p>
          <select aria-label="Sort products" value={sort} onChange={(e) => update('sort', e.target.value === 'az' ? '' : e.target.value)}>
            <option value="az">A to Z</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
          {(category || search || shop) && <Link to="/shop">Clear filters</Link>}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Stocking up your screen…</div>
      ) : error ? (
        <div className="empty-state error" role="alert">
          {error}
          <button onClick={reload}>Try again</button>
        </div>
      ) : !list.length ? (
        <div className="empty-state">
          <h2>{products.length ? 'No matching products' : 'Your campus shops are getting ready'}</h2>
          <p>{products.length ? 'Try another category or search.' : 'Menus will appear here as soon as shops add them.'}</p>
        </div>
      ) : (
        groups
          .filter((g) => g.items.length)
          .map((g) => (
            <section key={g.id} className="product-shelf">
              <div className="shelf-heading">
                <h2>{g.name}</h2>
                {embedded && <Link to={`/shop?category=${encodeURIComponent(g.id)}`}>see all →</Link>}
              </div>
              <div className={embedded ? 'product-grid quick-shelf' : 'product-grid'}>
                {g.items.slice(0, embedded ? 6 : undefined).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))
      )}
    </section>
  );
}
