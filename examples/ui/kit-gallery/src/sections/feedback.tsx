// Feedback uses the same Quiet tokens as controls, with status colours only for status.
import { createSignal } from 'zinc:ui/solid';
import { Alert, Banner, Progress, ProgressRing, Meter, Spinner, Skeleton, Badge, Avatar, EmptyState, Timeline, captionText, toast } from 'zinc:ui/kit';

enum PreviewState { Preparing, Ready }
export function FeedbackSection(): i32 {
  const [state, setState] = createSignal(PreviewState.Preparing);
  const working = (): boolean => state() === PreviewState.Preparing;
  const finish = (): void => { if (state() === PreviewState.Preparing) { setState(PreviewState.Ready); toast('Project created'); } };
  return <View className="flex-col gap-6">
    <Banner title="Version 1.1 is ready." description="Your project will reopen after the update." action="Restart" onAction={() => toast('Update queued')} dismissible={true} />
    <View className="flex-row flex-wrap items-start gap-6">
      <View className="w-[420px] flex-col gap-5">
        <Alert title="All changes saved" description="The workshop is up to date." tone="success" />
        <Alert title="Storage almost full" description="Archive unused builds to make room." tone="warning" dismissible={true} />
        <Progress label="Uploading project" value={() => 68} showValue={true} />
        <Progress label={working() ? 'Preparing preview' : 'Preview ready'} value={() => working() ? 0 : 100} indeterminate={working()} />
        <Meter label="Storage" value={() => 18.4} max={20} unit="GB" />
        <Timeline label="Project history" items={[
          { title: 'Revision published', description: 'Workshop is ready to share.', time: '2 min ago', tone: 'success' },
          { title: 'Build needs attention', description: 'A source file is missing.', time: '1 hour ago', tone: 'danger', icon: 'circle-alert' },
        ]} />
      </View>
      <View className="w-[420px] flex-col gap-5">
        <View className="flex-row flex-wrap gap-2"><Badge label="Draft" /><Badge label="Online" tone="success" dot={true} /><Badge label="New" tone="info" solid={true} /><Badge label="Review" variant="outline" /></View>
        <View className="flex-row items-center gap-3"><Avatar name="Ada Lovelace" status="online" /><Avatar name="Grace Hopper" status="away" /><Avatar name="Alan Turing" status="busy" /><Avatar name="Katherine Johnson" status="offline" /><Text className={captionText()}>Project collaborators</Text></View>
        <View className="flex-row items-center gap-5"><ProgressRing label="Onboarding" value={() => 72} size={100} showValue={true} /><Spinner active={working} label="Preparing project" /><Text className={captionText()}>{working() ? 'Preparing project' : 'Preview ready'}</Text></View>
        <View className="flex-row gap-3"><Skeleton width={40} height={40} circle={true} active={working} /><View className="grow flex-col gap-3"><Skeleton height={12} active={working} /><Skeleton width={230} height={12} active={working} /></View></View>
        <Show when={working()}><EmptyState title="No projects yet" description="A project holds your screens, builds and collaborators." action="New project" onAction={finish} /></Show>
        <Show when={!working()}><Alert title="Workshop created" description="Your project is ready." tone="success" /></Show>
      </View>
    </View>
  </View>;
}
