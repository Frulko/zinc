/** @jsxHelpers ./host */
// zinc:ui/kit — Input and Textarea, after shadcn/ui's: a field with a 1 px border in the theme's input colour, rounded-md, px-3, text-sm,
// a transparent fill (it follows the page), a muted placeholder, a stronger border while focused, half opacity when disabled.
//
//   <Input value={() => name()} onInput={setName} placeholder="Your name" />
//   <Textarea value={() => note()} onInput={setNote} rows={4} />
import { theme } from './theme';
import { look } from '../platform/index';

export interface InputProps {
  value?: () => string;
  onInput?: (v: string) => void;
  placeholder?: string;
  type?: string;          // 'password' hides the text
  name?: string;          // the field's name in a Form (autofill, web target)
  disabled?: boolean;
  className?: string;     // extra layout classes ('w-80', 'grow'...)
}

export interface TextareaProps {
  value?: () => string;
  onInput?: (v: string) => void;
  placeholder?: string;
  rows?: number;          // visible lines (3); 0 grows with the text
  name?: string;
  disabled?: boolean;
  className?: string;
}

/** The look both fields share (shadcn's border-input, placeholder:text-muted-foreground, focus-visible:border-ring, disabled:opacity-50). */
function fieldClass(disabled: boolean): string {
  const t = theme();
  return `w-full ${look().field} border border-${t.input} bg-transparent text-${t.foreground} placeholder:text-${t.mutedForeground} focus:border-${t.mutedForeground}${disabled ? ' opacity-50' : ''}`;
}

export function Input(props?: InputProps): i32 {
  return <Input className={`${look().fieldHeight} py-1 ${fieldClass(props?.disabled ?? false)} ${props?.className ?? ''}`}
    value={props?.value !== undefined ? (props?.value as () => string)() : ''} placeholder={props?.placeholder ?? ''} name={props?.name ?? ''}
    password={props?.type === 'password'} disabled={props?.disabled ?? false}
    onInput={(v: string) => { const f = props?.onInput; if (f !== undefined) f(v); }} />;
}

export function Textarea(props?: TextareaProps): i32 {
  return <TextArea className={`min-h-16 py-2 ${fieldClass(props?.disabled ?? false)} ${props?.className ?? ''}`} rows={props?.rows ?? 3}
    value={props?.value !== undefined ? (props?.value as () => string)() : ''} placeholder={props?.placeholder ?? ''} name={props?.name ?? ''}
    disabled={props?.disabled ?? false}
    onInput={(v: string) => { const f = props?.onInput; if (f !== undefined) f(v); }} />;
}
