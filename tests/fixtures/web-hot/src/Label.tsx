import { count } from './state';

// a template whose line starts like an export (ui/forms' script editor): not an export of this module
const sample = `// a script the user edits
export function onStart(): void {}`;

export function Label(): i32 {
  return <Text className="text-lg text-slate-900">{'Label A: ' + count() + (sample.length > 0 ? '' : '?')}</Text>;
}
