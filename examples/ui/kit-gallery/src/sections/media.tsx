import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { mediaPictures } from '../media/Pictures';
import { MediaViewer } from '../media/Viewer';
import { MediaCrop } from '../media/Crop';
import { MediaCompare } from '../media/Compare';
import { MediaSlides } from '../media/Slides';
export function MediaSection():i32 {
 const pictures=mediaPictures();
 const show=(name:string):boolean=>env('GALLERY')===''||env('GALLERY')==='media'||env('GALLERY')==='media-'+name;
 return <View className="flex-col gap-6"><Text className={heading(3)}>Media</Text>
  <Show when={show('viewer')}><MediaViewer pictures={pictures}/></Show>
  <Show when={show('crop')}><MediaCrop pictures={pictures}/></Show>
  <Show when={show('compare')}><MediaCompare pictures={pictures}/></Show>
  <Show when={show('carousel')}><MediaSlides pictures={pictures}/></Show>
 </View>;
}
