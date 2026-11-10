import { ExtendedSection } from './sections/extended';
import { MediaSection } from './sections/media';
import { PlanningSection } from './sections/planning';
// kit-gallery: every zinc:ui/kit component on one scrolling page, in the Solid model.
// The switch in the header flips the whole page between the light and the dark theme.
import { ChartsSection } from './sections/charts';
import { env } from 'zinc:sys';
import { ActionsSection } from './sections/actions';
import { NavigationSection } from './sections/navigation';
import { ChromeSection } from './sections/chrome';
import { FeedbackSection } from './sections/feedback';
import { SelectionSection } from './sections/selection';
import { PickersSection } from './sections/pickers';
import { InputsSection } from './sections/inputs';
import { render, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { GalleryHeader } from './Header';
import { SelectOption, heading, theme, useQuietTheme } from 'zinc:ui/kit';
import { setDarkMode } from './state';
import { ButtonsCard } from './sections/buttons';
import { SettingsCard } from './sections/settings';
import { StatsRow, BadgesCard, AlertsColumn, TeamList } from './sections/display';
import { OverlaysCard } from './sections/overlays';
import { CodeSection } from './sections/code';
import { DataSection } from './sections/data';
import { ToolsSection } from './sections/tools';
import { AiSection } from './sections/ai';
import { FoundationsSection } from './sections/foundations';

useQuietTheme();
if (env('GALLERY_DARK') === '1') setDarkMode(true);

/** A labelled group of components. */
function Section(props: { title: string; children: () => i32 }): i32 {
  return <View className="flex-col gap-3">
    <Text className={heading(3)}>{props.title}</Text>
    {props.children()}
  </View>;
}

/** Enter the selected family's actual controls, keeping Tab in document order. */
function firstControl(root: i32): i32 {
  const node = ui.inspectNode(root);
  if (node === null || node.hidden || ui.isDisabled(root)) return -1;
  if (node.focusable) return root;
  for (const child of node.children) {
    const control = firstControl(child);
    if (control >= 0) return control;
  }
  return -1;
}

function App(): i32 {
  const all = env('GALLERY') === '';
  const scroll = createNodeRef();
  const families: SelectOption[] = [
    { value: 'actions', label: 'Actions' }, { value: 'navigation', label: 'Navigation' },
    { value: 'chrome', label: 'App chrome' }, { value: 'selection', label: 'Selection' },
    { value: 'pickers', label: 'Pickers' }, { value: 'inputs', label: 'Inputs' },
    { value: 'data', label: 'Data' }, { value: 'code', label: 'Code' },
    { value: 'planning', label: 'Planning' }, { value: 'charts', label: 'Charts' },
    { value: 'tools', label: 'Tool panels' }, { value: 'media', label: 'Media' },
    { value: 'ai', label: 'AI interfaces' }, { value: 'overlays', label: 'Overlays' },
    { value: 'feedback', label: 'Feedback' }, { value: 'foundations', label: 'Foundations' },
    { value: 'extended', label: 'Extended' }
  ];
  const anchors = families.map(() => createNodeRef());
  const jump = (id: string): void => {
    const index = families.findIndex((family) => family.value === id);
    if (index < 0) { ui.scrollTo(scroll.node, 0, 0, !ui.prefersReducedMotion()); return; }
    const anchor = anchors[index].node;
    ui.focusNode(firstControl(anchor));
    const target = ui.screenBox(anchor), viewport = ui.screenBox(scroll.node);
    ui.scrollTo(scroll.node, 0, ui.scrollTop(scroll.node) + target[1] - viewport[1], !ui.prefersReducedMotion());
  };
  return <View className={`h-full flex-col bg-${theme().background}`}>
    <GalleryHeader sections={all ? families : []} onJump={jump} />
    <ScrollView ref={scroll} className="flex-1 min-h-0">
    <View className="flex-col gap-12 p-4 md:p-8 min-w-0">
      <Show when={all || env('GALLERY') === 'actions' || env('GALLERY') === 'palette'}>
        <View ref={anchors[0]} role="region" aria-label="Actions" className="flex-col min-w-0">
          <ActionsSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'navigation'}>
        <View ref={anchors[1]} role="region" aria-label="Navigation" className="flex-col min-w-0">
          <NavigationSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'chrome'}>
        <View ref={anchors[2]} role="region" aria-label="App chrome" className="flex-col min-w-0">
          <ChromeSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'selection'}>
        <View ref={anchors[3]} role="region" aria-label="Selection" className="flex-col min-w-0">
          <SelectionSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'overlays'}>
        <View ref={anchors[13]} role="region" aria-label="Overlays" className="flex-col min-w-0">
          <Section title="Overlays"><OverlaysCard /></Section>
        </View>
      </Show>
      <Show when={all || env('GALLERY').startsWith('pickers')}>
        <View ref={anchors[4]} role="region" aria-label="Pickers" className="flex-col min-w-0">
          <PickersSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'inputs'}>
        <View ref={anchors[5]} role="region" aria-label="Inputs" className="flex-col min-w-0">
          <InputsSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'feedback'}>
        <View ref={anchors[14]} role="region" aria-label="Feedback" className="flex-col min-w-0">
          <Section title="Feedback"><FeedbackSection /></Section>
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'data'}>
        <View ref={anchors[6]} role="region" aria-label="Data" className="flex-col min-w-0">
          <DataSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'code'}>
        <View ref={anchors[7]} role="region" aria-label="Code" className="flex-col min-w-0">
          <CodeSection />
        </View>
      </Show>

      <Show when={all || env('GALLERY') === 'planning'}>
        <View ref={anchors[8]} role="region" aria-label="Planning" className="flex-col min-w-0">
          <PlanningSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY').startsWith('charts')}>
        <View ref={anchors[9]} role="region" aria-label="Charts" className="flex-col min-w-0">
          <ChartsSection />
        </View>
      </Show>

      <Show when={all || env('GALLERY') === 'tools'}>
        <View ref={anchors[10]} role="region" aria-label="Tool panels" className="flex-col min-w-0">
          <ToolsSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY').startsWith('media')}>
        <View ref={anchors[11]} role="region" aria-label="Media" className="flex-col min-w-0">
          <MediaSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY') === 'ai'}>
        <View ref={anchors[12]} role="region" aria-label="AI interfaces" className="flex-col min-w-0">
          <AiSection />
        </View>
      </Show>
      <Show when={all || env('GALLERY').startsWith('extended')}>
        <View ref={anchors[16]} role="region" aria-label="Extended" className="flex-col min-w-0"><ExtendedSection /></View>
      </Show>
      <Show when={all || env('GALLERY') === 'foundations'}>
      <View ref={anchors[15]} role="region" aria-label="Foundations" className="flex-col gap-8 min-w-0">
      <FoundationsSection />
      <Section title="Metrics"><StatsRow /></Section>
      <Section title="Controls">
        <View className="flex-row flex-wrap gap-6 items-start">
          <ButtonsCard />
          <SettingsCard />
        </View>
      </Section>
      <Section title="Feedback and data">
        <View className="flex-row flex-wrap gap-6 items-start">
          <AlertsColumn />
          <View className="flex-col gap-6">
            <BadgesCard />
            <TeamList />
          </View>
        </View>
      </Section>
      </View>
      </Show>
    </View>
    </ScrollView>
  </View>;
}

render(App, 0xfafafa, null);
