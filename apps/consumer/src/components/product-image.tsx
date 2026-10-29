import { productPhotoUrl } from '@campuscart/core';
import { Image, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import type { StyleProp } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/**
 * A product photo for lists: the 320 px thumbnail (about a tenth of the download), cached in memory
 * and on disk. Photos without a thumbnail yet fall back to the full image.
 */
export function ProductImage({ path, style, label }: { path: string; style: StyleProp<ImageStyle>; label?: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const size = failedPath === path ? 'full' : 'thumb';
  return (
    <Image
      source={productPhotoUrl(SUPABASE_URL, path, size)}
      style={style}
      contentFit="cover"
      transition={150}
      cachePolicy="memory-disk"
      recyclingKey={path}
      accessibilityLabel={label}
      onError={() => size === 'thumb' && setFailedPath(path)}
    />
  );
}
