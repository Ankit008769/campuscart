import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { SHOP, addUser, as, asOwner, createDb } from './harness.ts';

let db: PGlite;
let printShop: string;
let otherShop: string;
let student: string;
let other: string;

before(async () => {
  db = await createDb();
  await asOwner(
    db,
    `insert into public.allowed_logins (email, role, shop_id) values
       ('print.shop@gmail.com', 'merchant_owner', $1), ('juice.staff@gmail.com', 'merchant_owner', $2)`,
    [SHOP.stationery, SHOP.juice],
  );
  printShop = await addUser(db, 'print.shop@gmail.com', 'Print Owner');
  otherShop = await addUser(db, 'juice.staff@gmail.com', 'Juice Owner');
  student = await addUser(db, '24bec600@nith.ac.in', 'Nidhi');
  other = await addUser(db, '24bec601@nith.ac.in', 'Varun');
  await asOwner(db, 'insert into public.print_settings (shop_id, bw_page_paise, color_page_paise, max_pages) values ($1, 200, 1000, 50)', [
    SHOP.stationery,
  ]);
});

const newJob = (userId: string, color = false, copies = 2) =>
  as(db, userId, async () => {
    const id = crypto.randomUUID();
    await db.query(
      `insert into public.print_jobs (id, shop_id, file_path, file_name, copies, color) values ($1, $2, $3, 'Lab report.pdf', $4, $5)`,
      [id, SHOP.stationery, `${userId}/${id}.pdf`, copies, color],
    );
    return id;
  });
const setPages = async (jobId: string, pages: number) => {
  await db.exec('set role service_role');
  try {
    return (await db.query<{ price_paise: number }>('select * from public.set_print_pages($1, $2)', [jobId, pages])).rows[0];
  } finally {
    await db.exec('reset role');
  }
};
const canRead = (userId: string, path: string) =>
  as(db, userId, async () => (await db.query<{ ok: boolean }>('select public.can_read_print_file($1) as ok', [path])).rows[0].ok);

test('only the price-print function prices a job, from the shop rates', async () => {
  const job = await newJob(student);
  await assert.rejects(as(db, student, () => db.query('select public.set_print_pages($1, 1)', [job])), /permission denied/);
  await assert.rejects(
    as(db, student, () => db.query(`update public.print_jobs set price_paise = 1 where id = $1`, [job])),
    /permission denied/,
  );
  assert.equal((await setPages(job, 12)).price_paise, 12 * 2 * 200);
  await assert.rejects(setPages(await newJob(student, true, 1), 51), /up to 50 pages/);
  await assert.rejects(
    as(db, student, () =>
      db.query(`insert into public.print_jobs (shop_id, file_path, file_name) values ($1, $2, 'x.pdf')`, [SHOP.stationery, `${other}/x.pdf`]),
    ),
    /print_jobs_check|check constraint/,
  );
});

test('a priced job becomes an order, and only the ordering shop can read the file', async () => {
  const job = await newJob(student, true, 1);
  await setPages(job, 3);
  const path = `${student}/${job}.pdf`;
  assert.equal(await canRead(printShop, path), false, 'not before it is ordered');

  const [order] = await as(db, student, async () =>
    (await db.query<{ id: string; subtotal_paise: number }>(`select * from public.place_print_order($1, 'pickup', 'cash')`, [job])).rows,
  );
  assert.equal(order.subtotal_paise, 3000);
  const [item] = await asOwner<{ name_snapshot: string }>(db, 'select name_snapshot from public.order_items where order_id = $1', [order.id]);
  assert.match(item.name_snapshot, /^Printout: Lab report\.pdf \(3 pages, colour\)$/);
  await assert.rejects(as(db, student, () => db.query(`select public.place_print_order($1, 'pickup', 'cash')`, [job])), /already ordered/);

  assert.equal(await canRead(printShop, path), true);
  assert.equal(await canRead(otherShop, path), false);
  assert.equal(await canRead(student, path), false, 'not even the student');
  assert.equal(await canRead(other, path), false);
  assert.deepEqual(await as(db, other, async () => (await db.query('select id from public.print_jobs')).rows), []);
});
