// A pure-Zinc plugin: this file is compiled straight into the program, exactly like project source.
// No native code, no plugin.json "targets" build settings needed beyond declaring the target is allowed.
export function greeting(name: string): string {
  return 'Hello, ' + name + '!';
}

export function shout(name: string): string {
  return greeting(name).toUpperCase();
}
