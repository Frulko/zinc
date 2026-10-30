// The lesson beside the sketch (ZN-774.26): its title and step, what to do, the verdict of the last check (made at each save), and on
// demand a hint, the solution (written into the editor) and the lesson's page. State and commands: app/lesson.ts.
import * as ui from 'zinc:ui';
import * as opener from 'zinc:system/opener';
import { theme, bg, fg, bd } from '../app/theme';
import { lesson, LessonState, hintOpen, setHintOpen, solveStep, closeLesson, checkLesson } from '../app/lesson';
import { saveAll } from '../app/workspace';
import { IconButton } from './Controls';
import { I_CLOSE } from './icons';
import { t } from '../app/text';

function state(): LessonState { return lesson() as LessonState; }

function Pill(props: { label: () => string; onPress: () => void; strong?: boolean }): i32 {
  const strong = props.strong ?? false;
  return <View className={`flex-row items-center h-[28] px-3 rounded-full cursor-pointer ${strong ? bg(theme().accent) : bg(theme().surface)} hover:${bg(strong ? theme().accent : theme().hover)}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Text className={`text-[12px] font-medium ${fg(strong ? theme().onAccent : theme().text)}`}>{props.label()}</Text>
  </View>;
}

/** The verdict of the last check: done, not yet (the step's message), or the program does not compile. */
function verdict(): string {
  const s = state();
  if (s.done) return t('atelier.lesson.done');
  if (s.checked === 0) return '';
  if (s.passed) return t('atelier.lesson.passed', ['step', `${s.checked}`]);
  return s.message;
}

export function LessonPanel(): i32 {
  return <View className={`w-[300] flex-col border-l p-3.5 gap-2.5 ${bg(theme().sidebar)} ${bd(theme().borderSoft)}`}>
    <View className="flex-row items-center gap-2">
      <Text className={`grow shrink text-[14px] font-semibold ${fg(theme().text)}`}>{state().title}</Text>
      <IconButton kind={I_CLOSE} size={12} onPress={() => closeLesson()} tip={() => t('atelier.lesson.close')} />
    </View>
    <Text className={`text-[12px] ${fg(theme().muted)}`}>{state().done ? t('atelier.lesson.all', ['steps', `${state().steps}`]) : t('atelier.lesson.step', ['step', `${state().step}`, 'steps', `${state().steps}`])}</Text>
    {!state().done && <Text className={`text-[14px] leading-[21] ${fg(theme().text)}`}>{state().text}</Text>}
    {verdict() !== '' && <View className={`rounded-lg px-2.5 py-2 ${bg(state().passed || state().done ? theme().accentSoft : theme().errorSoft)}`}>
      <Text className={`text-[13px] leading-[19] ${fg(state().passed || state().done ? theme().success : theme().error)}`}>{verdict()}</Text>
    </View>}
    {hintOpen() && !state().done && <Text className={`text-[13px] leading-[19] ${fg(theme().muted)}`}>{t('atelier.lesson.hint_text', ['hint', state().hint])}</Text>}
    <View className="flex-row flex-wrap items-center gap-1.5 pt-1">
      {!state().done && <Pill strong label={() => t('atelier.lesson.check')} onPress={() => { saveAll(); checkLesson(); }} />}
      {!state().done && <Pill label={() => t('atelier.lesson.hint')} onPress={() => setHintOpen(!hintOpen())} />}
      {!state().done && <Pill label={() => t('atelier.lesson.solution')} onPress={() => solveStep()} />}
      <Pill label={() => t('atelier.lesson.read')} onPress={() => opener.openUrl(state().page)} />
    </View>
  </View>;
}
