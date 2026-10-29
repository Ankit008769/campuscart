import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, VARIANT, addUser, as, asOwner, createDb, placeOrder } from './harness.ts';

let db: PGlite;
let owner: string;
let otherOwner: string;
let student: string;
let snacks: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('catalog.owner@gmail.com', 'merchant_owner', $1),
       ('other.owner@gmail.com', 'merchant_owner', $2)`,
    [SHOP.general, SHOP.stationery],
  );
  owner = await addUser(db, 'catalog.owner@gmail.com', 'General Owner');
  otherOwner = await addUser(db, 'other.owner@gmail.com', 'Stationery Owner');
  student = await addUser(db, '24bme020@nith.ac.in', 'Ishaan');
  [{ id: snacks }] = await asOwner<{ id: string }>(db, `select id from public.categories where name = 'Snacks'`);
});

type VariantInput = { id?: string; label: string; price_paise: number; mrp_paise: number; in_stock?: boolean };
const save = (
  userId: string,
  item: {
    productId?: string | null;
    shopId?: string;
    name: string;
    variants: VariantInput[];
    imagePath?: string | null;
    isVeg?: boolean | null;
    active?: boolean;
  },
) =>
  as(db, userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      `select public.save_product(p_product_id => $1, p_shop_id => $2, p_name => $3, p_description => $4,
         p_category_id => $5, p_is_veg => $6, p_image_path => $7, p_active => $8, p_variants => $9::jsonb) as id`,
      [
        item.productId ?? null,
        item.shopId ?? SHOP.general,
        item.name,
        '',
        snacks,
        item.isVeg ?? null,
        item.imagePath ?? null,
        item.active ?? true,
        JSON.stringify(item.variants),
      ],
    );
    return rows[0].id;
  });

const variantsOf = (productId: string) =>
  asOwner<{ id: string; label: string; price_paise: number; sort: number }>(
    db,
    'select id, label, price_paise, sort from public.variants where product_id = $1 order by sort',
    [productId],
  );

test('a shop adds an item with sizes, and students find it', async () => {
  const id = await save(owner, {
    name: 'Paneer Puff',
    variants: [
      { label: 'Single', price_paise: 2500, mrp_paise: 2500 },
      { label: 'Pack of 2', price_paise: 4500, mrp_paise: 5000 },
    ],
  });
  assert.deepEqual(
    (await variantsOf(id)).map((v) => [v.label, v.price_paise, v.sort]),
    [
      ['Single', 2500, 1],
      ['Pack of 2', 4500, 2],
    ],
  );
  const hits = await as(db, student, async () =>
    (await db.query<{ name: string }>(`select name from public.search_products('paneer puff')`)).rows,
  );
  assert.ok(hits.some((h) => h.name === 'Paneer Puff'));
});

test('editing changes prices, drops removed sizes, and old bills keep their copy', async () => {
  const id = await save(owner, {
    name: 'Veg Sandwich',
    variants: [
      { label: 'Plain', price_paise: 3000, mrp_paise: 3000 },
      { label: 'Grilled', price_paise: 4000, mrp_paise: 4000 },
    ],
  });
  const [plain, grilled] = await variantsOf(id);
  await as(db, student, () =>
    placeOrder(db, { shopId: SHOP.general, mode: 'pickup', items: [{ variant_id: grilled.id, qty: 1 }] }),
  );

  await save(owner, {
    productId: id,
    name: 'Veg Sandwich',
    variants: [{ id: plain.id, label: 'Plain', price_paise: 3500, mrp_paise: 3500 }],
  });
  assert.deepEqual(
    (await variantsOf(id)).map((v) => [v.id, v.price_paise]),
    [[plain.id, 3500]],
  );
  const [item] = await asOwner<{ variant_id: string | null; name_snapshot: string; price_paise_snapshot: number }>(
    db,
    `select variant_id, name_snapshot, price_paise_snapshot from public.order_items where name_snapshot like 'Veg Sandwich%'`,
  );
  assert.equal(item.variant_id, null);
  assert.equal(item.price_paise_snapshot, 4000);
});

test('a price above MRP is refused with a clear message, and nothing is half-saved', async () => {
  await assert.rejects(
    save(owner, {
      name: 'Hazelnut Cold Brew',
      variants: [
        { label: 'Small', price_paise: 4000, mrp_paise: 4000 },
        { label: 'Large', price_paise: 7000, mrp_paise: 6000 },
      ],
    }),
    /price of Large cannot be above its MRP/,
  );
  const [{ n }] = await asOwner<{ n: number }>(db, `select count(*)::int as n from public.products where name = 'Hazelnut Cold Brew'`);
  assert.equal(n, 0);
});

test('a new photo from the shop clears the old stock-photo credit', async () => {
  const id = await save(owner, {
    name: 'Bread Pakora',
    imagePath: 'menu-food/bread-pakora.jpg',
    variants: [{ label: '', price_paise: 2000, mrp_paise: 2000 }],
  });
  await asOwner(db, `update public.products set photo_credit = 'Photo: Someone, CC BY 4.0' where id = $1`, [id]);

  const [kept] = await variantsOf(id);
  await save(owner, {
    productId: id,
    name: 'Bread Pakora',
    imagePath: 'menu-food/bread-pakora.jpg',
    variants: [{ id: kept.id, label: '', price_paise: 2200, mrp_paise: 2200 }],
  });
  let [{ photo_credit }] = await asOwner<{ photo_credit: string | null }>(
    db,
    'select photo_credit from public.products where id = $1',
    [id],
  );
  assert.equal(photo_credit, 'Photo: Someone, CC BY 4.0');

  await save(owner, {
    productId: id,
    name: 'Bread Pakora',
    imagePath: `shops/${SHOP.general}/bread-pakora-own.jpg`,
    variants: [{ id: kept.id, label: '', price_paise: 2200, mrp_paise: 2200 }],
  });
  [{ photo_credit }] = await asOwner<{ photo_credit: string | null }>(db, 'select photo_credit from public.products where id = $1', [
    id,
  ]);
  assert.equal(photo_credit, null);
});

test("shops cannot touch another shop's items, and students cannot add items", async () => {
  const id = await save(owner, { name: 'Samosa', variants: [{ label: '', price_paise: 1500, mrp_paise: 1500 }] });
  await assert.rejects(
    save(otherOwner, {
      productId: id,
      shopId: SHOP.general,
      name: 'Samosa',
      variants: [{ label: '', price_paise: 100, mrp_paise: 100 }],
    }),
    /only change your own shop/,
  );
  await assert.rejects(
    save(otherOwner, { shopId: SHOP.general, name: 'Sneaky', variants: [{ label: '', price_paise: 100, mrp_paise: 100 }] }),
    /only change your own shop/,
  );
  await assert.rejects(
    save(student, { name: 'Free Food', variants: [{ label: '', price_paise: 100, mrp_paise: 100 }] }),
    /only change your own shop/,
  );
  const [{ price }] = await asOwner<{ price: number }>(
    db,
    'select price_paise as price from public.variants where product_id = $1',
    [id],
  );
  assert.equal(price, 1500);
});

test('a whole category goes out of stock in one tap, for that shop only', async () => {
  const changed = await as(db, owner, async () =>
    (await db.query<{ n: number }>('select public.set_category_in_stock($1, false, $2) as n', [SHOP.general, snacks])).rows[0].n,
  );
  assert.ok(changed > 0);
  const [{ left }] = await asOwner<{ left: number }>(
    db,
    `select count(*)::int as left from public.variants v join public.products p on p.id = v.product_id
     where p.shop_id = $1 and p.category_id = $2 and v.in_stock`,
    [SHOP.general, snacks],
  );
  assert.equal(left, 0);

  // Another shop's owner changes nothing in this shop.
  const none = await as(db, otherOwner, async () =>
    (await db.query<{ n: number }>('select public.set_category_in_stock($1, true, $2) as n', [SHOP.general, snacks])).rows[0].n,
  );
  assert.equal(none, 0);
  const [maggi] = await asOwner<{ in_stock: boolean }>(db, 'select in_stock from public.variants where id = $1', [
    VARIANT.maggi70g,
  ]);
  assert.equal(maggi.in_stock, false);
});
