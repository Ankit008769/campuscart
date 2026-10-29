import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCatalogCsv, parseCsvRows } from './catalog-csv.ts';

test('splits quoted cells with commas, quotes and line breaks', () => {
  assert.deepEqual(parseCsvRows('a,"b, c","say ""hi"""\r\n"two\nlines",x,\n\n'), [
    ['a', 'b, c', 'say "hi"'],
    ['two\nlines', 'x', ''],
  ]);
});

test('groups sizes of one item and fills a blank MRP with the price', () => {
  const { items, errors } = parseCatalogCsv(
    [
      'Category,Item,Size,Price,MRP,Description',
      'Snacks,Maggi,Half,30,,Plain masala',
      'snacks,maggi,Full,"50.00",55,',
      'Drinks,Lassi,,40,40,',
    ].join('\n'),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(items, [
    {
      category: 'Snacks',
      name: 'Maggi',
      description: 'Plain masala',
      sizes: [
        { label: 'Half', pricePaise: 3000, mrpPaise: 3000 },
        { label: 'Full', pricePaise: 5000, mrpPaise: 5500 },
      ],
    },
    { category: 'Drinks', name: 'Lassi', description: '', sizes: [{ label: '', pricePaise: 4000, mrpPaise: 4000 }] },
  ]);
});

test('accepts "name" for the item column and columns in any order', () => {
  const { items, errors } = parseCatalogCsv('price,name,category\n20,Samosa,Snacks');
  assert.deepEqual(errors, []);
  assert.equal(items[0].name, 'Samosa');
});

test('reports each bad row by its line, and keeps the good ones', () => {
  const { items, errors } = parseCatalogCsv(
    ['category,item,size,price,mrp', 'Snacks,Puff,,25,20', 'Snacks,,,10,', ',Tea,,10,', 'Snacks,Chips,,abc,', 'Snacks,Bun,,15,'].join(
      '\n',
    ),
  );
  assert.deepEqual(errors, [
    'Row 2 (Puff): the price is above the MRP.',
    'Row 3: the item has no name.',
    'Row 4 (Tea): the category is empty.',
    'Row 5 (Chips): "abc" is not a price.',
  ]);
  assert.deepEqual(
    items.map((i) => i.name),
    ['Bun'],
  );
});

test('explains a missing header', () => {
  assert.deepEqual(parseCatalogCsv('Maggi,30').errors, ['The first row needs these column names: category, item, price.']);
});
