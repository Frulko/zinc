import { createSignal } from 'zinc:ui/solid';
import { ImageCompare } from 'zinc:ui/kit';
export function MediaCompare(p:{pictures:i32[]}):i32 {
 const [split,setSplit]=createSignal(0.5);
 return <ImageCompare label="Original and colour study" before={p.pictures[0]} after={p.pictures[1]} position={split} onChange={setSplit} aspect={1.6} height={300} beforeLabel="Original" afterLabel="Colour study"/>;
}
