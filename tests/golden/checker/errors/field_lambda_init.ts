// an unannotated field initialised by a lambda call reports the errors of the lambda's body (ZN-798)
class K {
  static x = (() => { const s: string = 5; return 1; })();
  y = (() => { const t: number = 'a'; return 2; })();
}
console.log('' + K.x + new K().y);
