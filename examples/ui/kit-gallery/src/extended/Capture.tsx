import { browseAttachments, browsePhoto } from './Files';
import { Dropzone, AvatarUpload, SignaturePad, SignatureStroke, Card, heading, theme } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
export function ExtendedCapture(): i32 {
  const [files, setFiles] = createSignal('No attachment yet'), [photo, setPhoto] = createSignal('Choose a local image'), [signature, setSignature] = createSignal<SignatureStroke[]>([{points:[{x:0.12,y:0.65,width:2.4},{x:0.16,y:0.35,width:1.8},{x:0.2,y:0.62,width:1.2},{x:0.24,y:0.3,width:2.1},{x:0.22,y:0.7,width:2.4},{x:0.29,y:0.52,width:1.3},{x:0.35,y:0.6,width:2.2},{x:0.4,y:0.4,width:1.2},{x:0.38,y:0.64,width:2.3},{x:0.48,y:0.53,width:1.2},{x:0.56,y:0.6,width:1.8},{x:0.67,y:0.46,width:1.4},{x:0.61,y:0.72,width:2.4},{x:0.77,y:0.58,width:1.2}]}]), [exported, setExported] = createSignal('');
  return <View className="flex-col gap-5 min-w-0"><Text className={heading(4)}>Local capture</Text>
    <Dropzone browse={browseAttachments} label="Add attachments" accept="png;jpg;jpeg;pdf;txt" description="Drop files from Finder, or browse. Up to 16 MB each." multiple={true} onFiles={(paths: string[]) => setFiles(paths.join(', '))} onReject={(path: string, reason: string) => setFiles(reason)}/>
    <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{files()}</Text>
    <View className="flex-row flex-wrap gap-5 items-start"><AvatarUpload browse={browsePhoto} name="Maya Okafor" onSelect={(path: string) => setPhoto(path)}/><View className="flex-col gap-2 grow shrink min-w-0"><Text className={`text-[13px] text-${theme().foreground}`}>A signature stays local</Text><SignaturePad value={signature} onChange={setSignature} height={150} onExport={(value: SignatureStroke[]) => setExported('Export callback received ' + value.length + ' strokes')}/><Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>{exported() || photo()}</Text></View></View>
  </View>;
}
