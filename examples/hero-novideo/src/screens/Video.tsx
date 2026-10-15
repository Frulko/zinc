// Trial copy for the HP TouchPad: the video screen needs FFmpeg, which is not built for webOS yet.
import { Card, CardContent, heading, mutedText } from 'zinc:ui/kit';

export function stepVideo(): void {}
export function Video() {
  return (
    <Card>
      <CardContent>
        <Text class={heading(2)}>Video</Text>
        <Text class={mutedText()}>Not on this device yet: zinc:video needs FFmpeg built for webOS.</Text>
      </CardContent>
    </Card>
  );
}
