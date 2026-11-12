import { createContext, WebGLRenderingContext, WebGLShader } from 'zinc:gl';
function compile(g: WebGLRenderingContext, source: string, fragment: boolean, expected: boolean): WebGLShader {
  const s = g.createShader(fragment ? g.FRAGMENT_SHADER : g.VERTEX_SHADER)!;
  g.shaderSource(s, source);
  g.compileShader(s);
  const ok = g.getShaderParameter(s, g.COMPILE_STATUS).bool;
  console.log('compile ' + expected + ' ' + ok + ' ' + g.getShaderInfoLog(s));
  if (ok !== expected) throw new Error('unexpected shader compile status: ' + source);
  if (g.getShaderSource(s) !== source) throw new Error('source changed');
  return s;
}
function pair(g: WebGLRenderingContext, vertex: string, fragment: string, expected: boolean): void {
  const v = compile(g, vertex, false, true);
  const f = compile(g, fragment, true, true);
  const p = g.createProgram()!;
  g.attachShader(p, v); g.attachShader(p, f); g.linkProgram(p);
  const ok = g.getProgramParameter(p, g.LINK_STATUS).bool;
  console.log('link ' + expected + ' ' + ok + ' ' + g.getProgramInfoLog(p));
  if (ok !== expected) throw new Error('unexpected shader link status');
  g.deleteProgram(p); g.deleteShader(v); g.deleteShader(f);
}
const v = 'attribute vec4 a; void main(){gl_Position=a;}';
const f = 'precision mediump float; void main(){gl_FragColor=vec4(0.25);}';
const v3 = 'in vec4 a; void main(){gl_Position=a;}';
const f3 = 'precision mediump float; out vec4 color; void main(){color=vec4(0.25);}';
const g = createContext(4, 4, 1)!;
pair(g, v, f, true);
pair(g, '// #version 300 es is only a comment\n' + v, f, true);
pair(g, '/* #version 300 es\n */\n' + v, f, true);
pair(g, '// continued \\\n#version 300 es\n' + v, f, true);
pair(g, '/* prefix */\n# version\t100\n' + v, '#version 100\n' + f, true);
pair(g, '/*\n#extension GL_FAKE : require\n*/\n' + v, f, true);
pair(g, '// continued \\\n#extension GL_FAKE : require\n' + v, f, true);
pair(g, '// continued \\\nswitch is inside a comment\n' + v, f, true);
compile(g, '#extension GL_FAKE : require\n' + v, false, false);
compile(g, '#version 300 es\n' + v3, false, false);
compile(g, '# version\t300 es\n' + v3, false, false);
compile(g, '#version 100 extra\n' + v, false, false);
compile(g, '#version 100 es\n' + v, false, false);
compile(g, '#version 330\n' + v, false, false);
compile(g, '/* unclosed\n' + v, false, false);
compile(g, v + '\n/* unclosed', false, false);
compile(g, v + '\n#version 100\n', false, false);
const derivative = 'precision mediump float; void main(){gl_FragColor=vec4(dFdx(0.25));}';
compile(g, '#extension GL_OES_standard_derivatives : require\n' + derivative, true, false);
if (g.getExtension('OES_standard_derivatives')) {
  compile(g, '#extension GL_OES_standard_derivatives : require\n' + derivative, true, true);
  compile(g, '#extension GL_OES_standard_derivatives : disable\n' + derivative, true, false);
}
pair(g, '// #version 300 es\r' + v, f, true);
pair(g, '#version 100\r' + v, '#version 100\n\r' + f, true);
const g2 = createContext(4, 4, 2)!;
pair(g2, '#version 300 es\r' + v3, '#version 300 es\n\r' + f3, true);
pair(g2, '#version 300 es\n' + v3, '#version 300 es\n' + f3, true);
pair(g2, ' \t# \tversion\t300\tes \r\n' + v3, '#version 300 es\n' + f3, true);
pair(g2, '// #version 300 es\n' + v, f, true);
pair(g2, '#version 100\n' + v, ' # version\t100\n' + f, true);
pair(g2, '#version 300 es\n' + v3, f, false);
pair(g2, v, '# version 300 es\n' + f3, false);
compile(g2, '// comment\n#version 300 es\n' + v3, false, false);
compile(g2, '\n#version 300 es\n' + v3, false, false);
compile(g2, '#version 300 es // comment\n' + v3, false, false);
compile(g2, '#version 300\n' + v3, false, false);
compile(g2, '#version 300 es extra\n' + v3, false, false);
compile(g2, '#version 300 es\n#version 300 es\n' + v3, false, false);
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
const badLine = compile(g, '// #version 300 es\n# version 100\n\nvoid main(){gl_Position=missing;}\n', false, false);
if (!g.getShaderInfoLog(badLine).includes('0:4:')) throw new Error('lost original diagnostic line');
g.deleteShader(badLine);
g.destroy(); g2.destroy();
console.log('webgl directives typed: ok');
