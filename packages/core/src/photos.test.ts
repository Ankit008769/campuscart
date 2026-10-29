import assert from 'node:assert/strict';
import { test } from 'node:test';

import { productPhotoUrl, thumbPath } from './api.ts';

test('thumbnails sit in a thumbs folder beside the photo', () => {
  assert.equal(thumbPath('menu-food/burger.jpg'), 'menu-food/thumbs/burger.jpg');
  assert.equal(thumbPath('shops/abc/123.jpg'), 'shops/abc/thumbs/123.jpg');
  assert.equal(
    productPhotoUrl('https://x.supabase.co', 'menu-food/burger.jpg', 'thumb'),
    'https://x.supabase.co/storage/v1/object/public/product-photos/menu-food/thumbs/burger.jpg',
  );
  assert.equal(
    productPhotoUrl('https://x.supabase.co', 'menu-food/burger.jpg'),
    'https://x.supabase.co/storage/v1/object/public/product-photos/menu-food/burger.jpg',
  );
});
