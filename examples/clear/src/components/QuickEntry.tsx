import { createNodeRef, createEffect, onMount } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { handleShortcut } from '../keyboard';
import { editingId, beginCreate, screen } from '../state';

/** Clear accepts typing without first clicking an Add button; native Input keeps IME/paste support. */
export function QuickEntry(): i32 {
  const input = createNodeRef();
  const focusCapture = (): void => {
    if (editingId() === '' && screen() !== 'themes') ui.focusNode(input.node);
  };
  onMount(focusCapture);
  createEffect(() => {
    if (editingId() === '' && screen() !== 'themes') queueMicrotask(focusCapture);
  });

  return <Input ref={input} value="" tabIndex={-1} aria-label="Type to create an item"
    className="absolute left-0 bottom-0 w-[1] h-[1] opacity-0"
    onKeyDown={handleShortcut}
    onInput={(text: string) => {
      ui.setValue(input.node, '');
      if (text.trim() !== '') beginCreate(text);
    }} />;
}
