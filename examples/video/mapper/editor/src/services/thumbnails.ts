// The small pictures of the media, from the mapper: an image, once decoded; -1 until there is one, or for good when the mapper makes none.
import * as gfx from 'zinc:gfx';
import { touch } from '../state';
import { getBytes } from './link';

const RETRY_MS = 3000, RETRIES: i32 = 10, COMING: i32 = 202;
const images = new Map<string, i32>();

async function fetchThumbnail(name: string, retries: i32): Promise<void> {
  const reply = await getBytes(`/thumbs/${name}`);
  if (reply.status === COMING && retries > 0) {
    setTimeout(() => { fetchThumbnail(name, retries - 1); }, RETRY_MS);
    return;
  }
  if (reply.status !== 200) return;
  const image = gfx.imageFromBytes(reply.bytes);
  images.set(name, image);
  if (image >= 0) touch();
}

export function thumbnailOf(name: string): i32 {
  if (images.has(name)) return images.get(name) as i32;
  images.set(name, -1);
  fetchThumbnail(name, RETRIES);
  return -1;
}
