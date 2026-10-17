import { count } from './state';
import cjs from 'cjs-pkg';

export function Label(): i32 {
  return <Text className="text-lg text-slate-900">{'Label A: ' + count() + ' ' + cjs.helper()}</Text>;
}
