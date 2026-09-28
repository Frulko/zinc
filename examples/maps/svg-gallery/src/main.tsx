// svg-gallery: sample SVG documents rendered at runtime by zinc:svg at three sizes, and one zooming continuously.
import { render } from 'zinc:ui/solid';
import { heading, leadText } from 'zinc:ui/kit';
import { DOCUMENTS, Document } from './documents';
import { SampleCard } from './components/SampleCard';
import { ZoomCard, tickZoom } from './components/ZoomCard';

function App(): i32 {
  return <View class="flex-col h-full gap-5 p-6 bg-zinc-50">
    <View class="flex-col gap-1">
      <Text class={heading(2)}>zinc:svg</Text>
      <Text class={leadText()}>Runtime vector rendering: paths, gradients, CSS, transforms, dashes.</Text>
    </View>
    <View class="flex-row grow gap-5">
      <ScrollView class="grow">
        <View class="flex-col gap-3 pb-1">
          {DOCUMENTS.map((doc: Document) => <SampleCard doc={doc} />)}
        </View>
      </ScrollView>
      <ZoomCard />
    </View>
  </View>;
}

render(App, 0xfafafa, tickZoom);
