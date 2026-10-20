import { count } from './state';

export function Label(): i32 {
  return <Text className="text-lg text-slate-900">{'Label A: ' + count()}</Text>;
}
