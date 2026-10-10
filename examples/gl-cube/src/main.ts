// gl-cube: a textured, lit cube drawn with zinc:gl (WebGL for compiled Zinc code) into a zinc:gfx image, interpreted or built with zinc build.
import { onFrame, clear, drawImage, createImage, width, height } from 'zinc:gfx';
import { createContext, Float32Array, Uint16Array, Uint8Array, WebGLRenderingContext, WebGLShader } from 'zinc:gl';
import { perspective, translation, rotation, multiply, normalMatrix } from './mat4';

const W: i32 = 480, H: i32 = 360;

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat3 uNormal;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vNormal = uNormal * aNormal;
  vUv = aUv;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uLight;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  float d = max(dot(normalize(vNormal), normalize(uLight)), 0.0);
  gl_FragColor = vec4(texture2D(uTex, vUv).rgb * (0.25 + 0.75 * d), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: u32, source: string): WebGLShader {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS).bool) console.log('shader: ' + gl.getShaderInfoLog(s));
  return s;
}

/** Six faces of four vertices: position, normal, texture coordinates (8 floats each), and two triangles per face. */
function cube(): number[] {
  const faces: number[][] = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  const v: number[] = [];
  for (const n of faces) {
    const u = n[1] !== 0 ? [1, 0, 0] : [-n[2], 0, n[0]];   // two axes of the face
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const corners: number[][] = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const c of corners) {
      for (let k = 0; k < 3; k++) v.push(n[k] + c[0] * u[k] + c[1] * w[k]);
      v.push(n[0]); v.push(n[1]); v.push(n[2]); v.push(c[2]); v.push(c[3]);
    }
  }
  return v;
}

function checker(size: i32): number[] {
  const px: number[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      px.push(on ? 240 : 40); px.push(on ? 180 : 90); px.push(on ? 60 : 200); px.push(255);
    }
  return px;
}

function run(gl: WebGLRenderingContext): void {
  const image = createImage(W, H);
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS).bool) console.log('link: ' + gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cube()), gl.STATIC_DRAW);
  const indices: number[] = [];
  for (let f = 0; f < 6; f++) for (const k of [0, 1, 2, 0, 2, 3]) indices.push(f * 4 + k);
  const elements = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  const attrib = (name: string, size: i32, offset: i32): void => {
    const at = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(at as u32);
    gl.vertexAttribPointer(at as u32, size, gl.FLOAT, false, 32, offset);
  };
  attrib('aPos', 3, 0);
  attrib('aNormal', 3, 12);
  attrib('aUv', 2, 24);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(checker(64)));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR as i32);
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'uLight'), 0.4, 0.7, 1.0);
  const mvp = gl.getUniformLocation(program, 'uMvp'), normal = gl.getUniformLocation(program, 'uNormal');
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  const view = multiply(perspective(0.9, W / H, 0.1, 50), translation(0, 0, -5));

  let frame = 0;
  onFrame((dt: number) => {
    const model = rotation(frame * 0.013 + 0.5, frame * 0.021 + 0.7);   // a function of the frame: interpreter and AOT draw the same frames
    gl.viewport(0, 0, W, H);
    gl.clearColor(0.06, 0.07, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(mvp, false, multiply(view, model));
    gl.uniformMatrix3fv(normal, false, normalMatrix(model));
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.present(image);
    clear(0x101418);
    drawImage(image, (width() - W) / 2, (height() - H) / 2, W, H, 255, 0);
    frame++;
  });
}

const context = createContext(W, H);
if (context === null) console.log('gl-cube: no WebGL on this machine');
else run(context);
