import { THUMB_WIDTH, uploadItemPhoto } from '@campuscart/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

// 800 px wide keeps photos far under the bucket's 2 MB limit and quick to load on campus Wi-Fi.
const PHOTO_WIDTH = 800;

export type PhotoSource = 'camera' | 'library';

/**
 * Lets the shop take or choose a photo, crops it square, shrinks it and uploads it to the shop's
 * folder. Returns the storage path, or null if they backed out.
 */
export async function pickAndUploadItemPhoto(shopId: string, source: PhotoSource): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Allow camera access for CampusCart Partner in Settings to take item photos.');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    // Android's photo picker needs no storage permission.
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const picked = result.canceled ? undefined : result.assets[0];
  if (!picked) return null;

  const shrink = async (width: number) => {
    const rendered = await ImageManipulator.manipulate(picked.uri).resize({ width }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
    if (!saved.base64) throw new Error('Could not prepare the photo. Please try again.');
    return base64ToBytes(saved.base64);
  };
  // The full photo for the item editor, and a small copy that menus and lists load.
  return uploadItemPhoto(supabase, shopId, await shrink(PHOTO_WIDTH), await shrink(THUMB_WIDTH));
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
