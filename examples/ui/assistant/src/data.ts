import { AiSource, AiModel, AiSuggestion } from 'zinc:ui/kit';

export const models: AiModel[] = [
  { id: 'brief', name: 'Brief script', detail: 'One paragraph' },
  { id: 'guide', name: 'Guide script', detail: 'With a practical next step' },
];
export const suggestions: AiSuggestion[] = [
  { id: 'interfaces', title: 'Why does an interface feel fast?', detail: 'State ownership and rendering' },
  { id: 'text', title: 'How does text fit on a line?', detail: 'Glyph metrics and advances' },
];
export const sources: AiSource[] = [
  { title: 'Dear ImGui: the IMGUI paradigm', url: 'https://github.com/ocornut/imgui/wiki/About-the-IMGUI-paradigm', snippet: 'An API style about state ownership; it does not prescribe the rendering implementation.' },
  { title: 'FreeType: glyph metrics', url: 'https://freetype.org/freetype2/docs/glyphs/glyphs-3.html', snippet: 'Baselines, bearings, advance widths and the effects of hinting.' },
];
export function scriptedAnswer(topic: string, model: string): string {
  const answer = topic === 'text'
    ? 'A line follows a baseline. Each glyph has an advance: the distance to the next pen position. Its visible bounds and its advance are different, so adding bitmap widths is not enough to lay out a line. Hinting can also change the metrics at small sizes. [2]'
    : 'Fast feedback starts with doing only the work an interaction needs. Immediate mode describes an API and who owns the state; it does not require redrawing continuously, nor guarantee speed. Compare concrete implementations and measure the input-to-screen path. [1]';
  if (model === 'brief') return answer;
  return answer + (topic === 'text'
    ? '\n\nTry this: draw a baseline and mark the pen positions for “mim”. Compare the advances with the visible letter bounds. Use a shaping library for scripts that need contextual glyph selection.'
    : '\n\nTry this: measure a single button press, then inspect layout, text and paint separately. Keep the application state in one place and avoid work when nothing changed.');
}
