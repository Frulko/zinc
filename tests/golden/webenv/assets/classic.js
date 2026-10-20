// a classic script: its declarations are the window's, and `this` in a plain call is the window
var classicVar = 42;
function classicHello() { return 'hello ' + classicVar + ' ' + (this === window); }
