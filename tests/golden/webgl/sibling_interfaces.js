// ZN-565: WebGLRenderingContext and WebGL2RenderingContext are sibling interfaces (both include WebGLRenderingContextBase), so a WebGL 2
// context is not `instanceof WebGLRenderingContext`. PixiJS 8, Phaser 4 and three.js tell the versions apart that way.
const gl1 = document.createElement('canvas').getContext('webgl'), gl2 = document.createElement('canvas').getContext('webgl2');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
console.log('gl2 instanceof WebGLRenderingContext', gl2 instanceof WebGLRenderingContext);
console.log('gl2 instanceof WebGL2RenderingContext', gl2 instanceof WebGL2RenderingContext);
console.log('gl1 instanceof WebGLRenderingContext', gl1 instanceof WebGLRenderingContext);
console.log('gl1 instanceof WebGL2RenderingContext', gl1 instanceof WebGL2RenderingContext);
console.log('the prototypes are siblings', Object.getPrototypeOf(WebGL2RenderingContext.prototype) === Object.prototype, Object.getPrototypeOf(WebGLRenderingContext.prototype) === Object.prototype);
console.log('shared members are each interface\'s own', own(WebGL2RenderingContext.prototype, 'drawArrays'), own(WebGL2RenderingContext.prototype, 'ARRAY_BUFFER'), own(WebGLRenderingContext.prototype, 'drawArrays'));
console.log('WebGL 2 members are not on WebGL 1', typeof gl1.createVertexArray, gl1.TEXTURE_3D, typeof gl2.createVertexArray, gl2.TEXTURE_3D);
console.log('constructors', gl1.constructor === WebGLRenderingContext, gl2.constructor === WebGL2RenderingContext, WebGL2RenderingContext.ARRAY_BUFFER, WebGLRenderingContext.ARRAY_BUFFER);
gl2.clearColor(0, 1, 0, 1); gl2.clear(gl2.COLOR_BUFFER_BIT);   // a shared method called through the WebGL 2 prototype
const p = new Uint8Array(4); gl2.readPixels(0, 0, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, p);
console.log('clear and read through WebGL 2', p.join(','), gl2.getError());
