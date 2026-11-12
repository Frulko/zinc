// The JavaScript WebGL bridge, independently of the typed host rows.
function context(version) {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext(version === 2 ? 'webgl2' : 'webgl');
  if (!g) throw new Error('no WebGL context');
  return g;
}
function compile(g, source, fragment, expected) {
  const s = g.createShader(fragment ? g.FRAGMENT_SHADER : g.VERTEX_SHADER);
  g.shaderSource(s, source); g.compileShader(s);
  const ok = g.getShaderParameter(s, g.COMPILE_STATUS);
  console.log('JS compile ' + expected + ' ' + ok + ' ' + g.getShaderInfoLog(s));
  if (ok !== expected || g.getShaderSource(s) !== source) throw new Error('shader status/source mismatch: ' + source);
  return s;
}
function pair(g, vertex, fragment, expected) {
  const v = compile(g, vertex, false, true), f = compile(g, fragment, true, true);
  const p = g.createProgram();g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);
  const ok = g.getProgramParameter(p,g.LINK_STATUS);
  console.log('JS link ' + expected + ' ' + ok + ' ' + g.getProgramInfoLog(p));
  if (ok !== expected) throw new Error('shader link mismatch');
  g.deleteProgram(p);g.deleteShader(v);g.deleteShader(f);
}
const v = 'attribute vec4 a; void main(){gl_Position=a;}';
const f = 'precision mediump float; void main(){gl_FragColor=vec4(0.25);}';
const v3 = 'in vec4 a; void main(){gl_Position=a;}';
const f3 = 'precision mediump float; out vec4 color; void main(){color=vec4(0.25);}';
const g = context(1);
for (const prefix of ['', '// #version 300 es is only a comment\n', '/* #version 300 es\n */\n', '// continued \\\n#version 300 es\n', '/* prefix */\n# version\t100\n', '/*\n#extension GL_FAKE : require\n*/\n', '// continued \\\n#extension GL_FAKE : require\n', '// continued \\\nswitch is in a comment\n', '// #version 300 es\r', '#version 100\r', '#version 100\n\r']) pair(g,prefix+v,f,true);
for (const prefix of ['#version 300 es\n', '# version\t300 es\n', '#version 100 extra\n', '#version 100 es\n', '#version 330\n', '/* unclosed\n', '#extension GL_FAKE : require\n']) g.deleteShader(compile(g,prefix+v,false,false));
g.deleteShader(compile(g,v+'\n#version 100\n',false,false));
g.deleteShader(compile(g,v+'\n/* unclosed',false,false));
const derivative = 'precision mediump float; void main(){gl_FragColor=vec4(dFdx(0.25));}';
g.deleteShader(compile(g,'#extension GL_OES_standard_derivatives : require\n'+derivative,true,false));
if (g.getExtension('OES_standard_derivatives')) {
  g.deleteShader(compile(g,'#extension GL_OES_standard_derivatives : require\n'+derivative,true,true));
  g.deleteShader(compile(g,'#extension GL_OES_standard_derivatives : disable\n'+derivative,true,false));
}
const g2 = context(2);
for (const prefix of ['#version 300 es\n', ' \t# \tversion\t300\tes \r\n', '#version 300 es\r', '#version 300 es\n\r']) pair(g2,prefix+v3,'#version 300 es\n'+f3,true);
pair(g2,'// #version 300 es\n'+v,f,true);
pair(g2,'#version 100\n'+v,' # version\t100\n'+f,true);
pair(g2,'# version\t300 es\n'+v3,f,false);
pair(g2,v,'#version 300 es\n'+f3,false);
for (const prefix of ['// comment\n#version 300 es\n', '\n#version 300 es\n', '#version 300 es // comment\n', '#version 300\n', '#version 300 es extra\n', '#version 300 es\n#version 300 es\n']) g2.deleteShader(compile(g2,prefix+v3,false,false));
// Delimiters are recognized after splicing; #version itself keeps its raw first-line rule.
for (const nl of ['\n', '\r']) {
  const splice = '\\' + nl;
  const head = '#version 300 es' + nl;
  for (const comment of ['/* comment *' + splice + '/', '/' + splice + '* comment */', '/' + splice + '*' + nl + '#version 100' + nl + '*/', '/' + splice + '/ #version 100' + nl, '/' + splice + splice + '*' + nl + '#extension GL_FAKE : require' + nl + '*' + splice + '/']) {
    pair(g2, head + comment + nl + v3, head + comment + nl + f3, true);
  }
  for (const comment of ['/' + splice + '* unclosed', '/* comment *' + splice + ' /', '/' + splice + '*' + nl + '#version 100']) {
    compile(g2, head + comment + nl + v3, false, false);
  }
  compile(g2, '#version 300' + splice + ' es' + nl + v3, false, false);
  const splitLine = compile(g2, head + '/* comment *\\\n/\nvoid main(){gl_Position=missing;}', false, false);
  if (!g2.getShaderInfoLog(splitLine).includes('0:4:')) throw new Error('lost splice diagnostic line');
  g2.deleteShader(splitLine);
}
const badLine = compile(g,'// #version 300 es\n# version 100\n\nvoid main(){gl_Position=missing;}\n',false,false);
if (!g.getShaderInfoLog(badLine).includes('0:4:')) throw new Error('lost diagnostic line');
g.deleteShader(badLine);
console.log('webgl directives JS: ok');
