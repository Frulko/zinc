const mk = (): (() => string) => () => 'hi'
console.log(mk()())
