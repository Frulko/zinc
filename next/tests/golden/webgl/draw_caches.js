// ZN-567: the draw checks cache the program's attributes at link and the largest index of the ranges drawn; changing the indices or relinking
// must be seen: an index past the vertex buffer is INVALID_OPERATION (0x502) again after bufferSubData, a relinked program's new attribute is checked.
const canvas = document.createElement('canvas');
canvas.width = 8; canvas.height = 8;
const gl = canvas.getContext('webgl', { antialias: false });
const shader = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }');
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
gl.attachShader(prog, fs);
gl.bindAttribLocation(prog, 0, 'p');
gl.linkProgram(prog); gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(6), gl.STATIC_DRAW);   // 3 vertices
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2]), gl.DYNAMIC_DRAW);
const draw = (what) => { gl.drawElements(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0); console.log(what, '0x' + gl.getError().toString(16)); };
draw('indices 0 1 2');
draw('the same range again');
gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 2, new Uint16Array([7]));
draw('index 7 of 3 vertices');
gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 2, new Uint16Array([1]));
draw('back to 0 1 2');
gl.detachShader(prog, gl.getAttachedShaders(prog)[0]);
gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 p; attribute vec4 q; void main() { gl_Position = vec4(p, 0.0, 1.0) + q; }'));
gl.bindAttribLocation(prog, 1, 'q');
gl.linkProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(4), gl.STATIC_DRAW);   // one vec4: too short for 3 vertices
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
draw('relinked, q too short');
