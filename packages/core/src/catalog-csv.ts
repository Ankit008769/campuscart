import { parseRupees } from './money';

/**
 * Reads a shop's menu from a spreadsheet saved as CSV, for the admin panel's catalog import.
 *
 * Columns (header row required, any order, any letter case): category, item, size, price, mrp,
 * description. Rows with the same item name in the same category become one item with several
 * sizes. A blank MRP means the item sells at MRP.
 */

export type CsvItem = {
  category: string;
  name: string;
  description: string;
  sizes: { label: string; pricePaise: number; mrpPaise: number }[];
};

export type CsvResult = { items: CsvItem[]; errors: string[] };

const REQUIRED = ['category', 'item', 'price'] as const;

/** Splits CSV text into rows of cells, handling quoted cells with commas, quotes and line breaks. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseCatalogCsv(text: string): CsvResult {
  const [header, ...rows] = parseCsvRows(text);
  if (!header) return { items: [], errors: ['The file is empty.'] };
  const columns = header.map((h) => h.trim().toLowerCase());
  const at = (name: string) => columns.indexOf(name === 'item' && !columns.includes('item') ? 'name' : name);
  const missing = REQUIRED.filter((name) => at(name) === -1);
  if (missing.length > 0) {
    return { items: [], errors: [`The first row needs these column names: ${missing.join(', ')}.`] };
  }

  const errors: string[] = [];
  const byKey = new Map<string, CsvItem>();
  rows.forEach((cells, index) => {
    const line = index + 2; // 1-based, after the header row
    const value = (name: string) => (at(name) === -1 ? '' : (cells[at(name)] ?? '').trim());
    const category = value('category');
    const name = value('item');
    const label = value('size');
    if (!name) return errors.push(`Row ${line}: the item has no name.`);
    if (!category) return errors.push(`Row ${line} (${name}): the category is empty.`);
    if (name.length > 80) return errors.push(`Row ${line} (${name}): names are up to 80 letters.`);

    const price = parseRupees(value('price'));
    const mrp = value('mrp') ? parseRupees(value('mrp')) : price;
    if (price === null || price <= 0) return errors.push(`Row ${line} (${name}): "${value('price')}" is not a price.`);
    if (mrp === null || mrp <= 0) return errors.push(`Row ${line} (${name}): "${value('mrp')}" is not an MRP.`);
    if (price > mrp) return errors.push(`Row ${line} (${name}): the price is above the MRP.`);

    const key = `${category.toLowerCase()}|${name.toLowerCase()}`;
    const item = byKey.get(key) ?? { category, name, description: '', sizes: [] };
    if (item.sizes.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
      return errors.push(`Row ${line} (${name}): size "${label || 'no size'}" appears twice.`);
    }
    if (item.sizes.length === 10) return errors.push(`Row ${line} (${name}): an item can have up to 10 sizes.`);
    item.sizes.push({ label, pricePaise: price, mrpPaise: mrp });
    if (!item.description) item.description = value('description');
    byKey.set(key, item);
  });

  return { items: [...byKey.values()], errors };
}
