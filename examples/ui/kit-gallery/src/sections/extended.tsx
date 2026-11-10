import { env } from 'zinc:sys';
import { heading } from 'zinc:ui/kit';
import { ExtendedCapture } from '../extended/Capture';
import { ExtendedSocial } from '../extended/Social';
import { ExtendedMotion } from '../extended/Motion';
import { ExtendedAudio } from '../extended/Audio';
export function ExtendedSection():i32 {
 const show=(name:string):boolean=>env('GALLERY')===''||env('GALLERY')==='extended'||env('GALLERY')==='extended-'+name;
 return <View className="flex-col gap-6 min-w-0"><Text className={heading(3)}>Extended</Text>
  <Show when={show('capture')}><ExtendedCapture/></Show><Show when={show('social')}><ExtendedSocial/></Show><Show when={show('motion')}><ExtendedMotion/></Show><Show when={show('audio')}><ExtendedAudio/></Show>
 </View>;
}
