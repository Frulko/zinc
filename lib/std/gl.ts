// zinc:gl (ZN-562): WebGL for compiled Zinc code. The calls go straight to the engine's WebGL implementation (src/gl: the WebGL1 class, the same validation
// as the QuickJS binding), with no JS engine and no boxing; a context draws offscreen and `present(image)` copies its pixels into a zinc:gfx image (createImage),
// which the program draws like any other. WebGL objects are typed handles. This first part has the calls a textured, lit mesh needs (ZN-562.01); the rest of
// WebGL 1 and 2 is ZN-562.02. The constants are getters generated from src/gl/webgl_consts.inc (every WebGL 1.0 constant): a class holds at most 255 fields.

/** The data of bufferData / texImage2D: what WebGL takes as typed arrays, here a Zinc array the engine converts on the way in. */
export class Float32Array { constructor(public data: number[]) {} }
export class Uint16Array { constructor(public data: number[]) {} }
export class Uint8Array { constructor(public data: u8[]) {} }

export class WebGLBuffer { constructor(readonly id: i32) {} }
export class WebGLShader { constructor(readonly id: i32) {} }
export class WebGLProgram { constructor(readonly id: i32) {} }
export class WebGLTexture { constructor(readonly id: i32) {} }
export class WebGLUniformLocation { constructor(readonly id: i32) {} }

export class WebGLRenderingContext {
  /** The context of __host_glCreate (0: none could be made); width and height of its drawing buffer. */
  constructor(readonly ctx: i32, readonly drawingBufferWidth: i32, readonly drawingBufferHeight: i32) {}
  get DEPTH_BUFFER_BIT(): u32 { return 0x00000100; }
  get STENCIL_BUFFER_BIT(): u32 { return 0x00000400; }
  get COLOR_BUFFER_BIT(): u32 { return 0x00004000; }
  get POINTS(): u32 { return 0x0000; }
  get LINES(): u32 { return 0x0001; }
  get LINE_LOOP(): u32 { return 0x0002; }
  get LINE_STRIP(): u32 { return 0x0003; }
  get TRIANGLES(): u32 { return 0x0004; }
  get TRIANGLE_STRIP(): u32 { return 0x0005; }
  get TRIANGLE_FAN(): u32 { return 0x0006; }
  get SRC_COLOR(): u32 { return 0x0300; }
  get ONE_MINUS_SRC_COLOR(): u32 { return 0x0301; }
  get SRC_ALPHA(): u32 { return 0x0302; }
  get ONE_MINUS_SRC_ALPHA(): u32 { return 0x0303; }
  get DST_ALPHA(): u32 { return 0x0304; }
  get ONE_MINUS_DST_ALPHA(): u32 { return 0x0305; }
  get DST_COLOR(): u32 { return 0x0306; }
  get ONE_MINUS_DST_COLOR(): u32 { return 0x0307; }
  get SRC_ALPHA_SATURATE(): u32 { return 0x0308; }
  get FUNC_ADD(): u32 { return 0x8006; }
  get BLEND_EQUATION(): u32 { return 0x8009; }
  get BLEND_EQUATION_RGB(): u32 { return 0x8009; }
  get BLEND_EQUATION_ALPHA(): u32 { return 0x883D; }
  get FUNC_SUBTRACT(): u32 { return 0x800A; }
  get FUNC_REVERSE_SUBTRACT(): u32 { return 0x800B; }
  get BLEND_DST_RGB(): u32 { return 0x80C8; }
  get BLEND_SRC_RGB(): u32 { return 0x80C9; }
  get BLEND_DST_ALPHA(): u32 { return 0x80CA; }
  get BLEND_SRC_ALPHA(): u32 { return 0x80CB; }
  get CONSTANT_COLOR(): u32 { return 0x8001; }
  get ONE_MINUS_CONSTANT_COLOR(): u32 { return 0x8002; }
  get CONSTANT_ALPHA(): u32 { return 0x8003; }
  get ONE_MINUS_CONSTANT_ALPHA(): u32 { return 0x8004; }
  get BLEND_COLOR(): u32 { return 0x8005; }
  get ARRAY_BUFFER(): u32 { return 0x8892; }
  get ELEMENT_ARRAY_BUFFER(): u32 { return 0x8893; }
  get ARRAY_BUFFER_BINDING(): u32 { return 0x8894; }
  get ELEMENT_ARRAY_BUFFER_BINDING(): u32 { return 0x8895; }
  get STREAM_DRAW(): u32 { return 0x88E0; }
  get STATIC_DRAW(): u32 { return 0x88E4; }
  get DYNAMIC_DRAW(): u32 { return 0x88E8; }
  get BUFFER_SIZE(): u32 { return 0x8764; }
  get BUFFER_USAGE(): u32 { return 0x8765; }
  get CURRENT_VERTEX_ATTRIB(): u32 { return 0x8626; }
  get FRONT(): u32 { return 0x0404; }
  get BACK(): u32 { return 0x0405; }
  get FRONT_AND_BACK(): u32 { return 0x0408; }
  get TEXTURE_2D(): u32 { return 0x0DE1; }
  get CULL_FACE(): u32 { return 0x0B44; }
  get BLEND(): u32 { return 0x0BE2; }
  get DITHER(): u32 { return 0x0BD0; }
  get STENCIL_TEST(): u32 { return 0x0B90; }
  get DEPTH_TEST(): u32 { return 0x0B71; }
  get SCISSOR_TEST(): u32 { return 0x0C11; }
  get POLYGON_OFFSET_FILL(): u32 { return 0x8037; }
  get SAMPLE_ALPHA_TO_COVERAGE(): u32 { return 0x809E; }
  get SAMPLE_COVERAGE(): u32 { return 0x80A0; }
  get INVALID_ENUM(): u32 { return 0x0500; }
  get INVALID_VALUE(): u32 { return 0x0501; }
  get INVALID_OPERATION(): u32 { return 0x0502; }
  get OUT_OF_MEMORY(): u32 { return 0x0505; }
  get CW(): u32 { return 0x0900; }
  get CCW(): u32 { return 0x0901; }
  get LINE_WIDTH(): u32 { return 0x0B21; }
  get ALIASED_POINT_SIZE_RANGE(): u32 { return 0x846D; }
  get ALIASED_LINE_WIDTH_RANGE(): u32 { return 0x846E; }
  get CULL_FACE_MODE(): u32 { return 0x0B45; }
  get FRONT_FACE(): u32 { return 0x0B46; }
  get DEPTH_RANGE(): u32 { return 0x0B70; }
  get DEPTH_WRITEMASK(): u32 { return 0x0B72; }
  get DEPTH_CLEAR_VALUE(): u32 { return 0x0B73; }
  get DEPTH_FUNC(): u32 { return 0x0B74; }
  get STENCIL_CLEAR_VALUE(): u32 { return 0x0B91; }
  get STENCIL_FUNC(): u32 { return 0x0B92; }
  get STENCIL_FAIL(): u32 { return 0x0B94; }
  get STENCIL_PASS_DEPTH_FAIL(): u32 { return 0x0B95; }
  get STENCIL_PASS_DEPTH_PASS(): u32 { return 0x0B96; }
  get STENCIL_REF(): u32 { return 0x0B97; }
  get STENCIL_VALUE_MASK(): u32 { return 0x0B93; }
  get STENCIL_WRITEMASK(): u32 { return 0x0B98; }
  get STENCIL_BACK_FUNC(): u32 { return 0x8800; }
  get STENCIL_BACK_FAIL(): u32 { return 0x8801; }
  get STENCIL_BACK_PASS_DEPTH_FAIL(): u32 { return 0x8802; }
  get STENCIL_BACK_PASS_DEPTH_PASS(): u32 { return 0x8803; }
  get STENCIL_BACK_REF(): u32 { return 0x8CA3; }
  get STENCIL_BACK_VALUE_MASK(): u32 { return 0x8CA4; }
  get STENCIL_BACK_WRITEMASK(): u32 { return 0x8CA5; }
  get VIEWPORT(): u32 { return 0x0BA2; }
  get SCISSOR_BOX(): u32 { return 0x0C10; }
  get COLOR_CLEAR_VALUE(): u32 { return 0x0C22; }
  get COLOR_WRITEMASK(): u32 { return 0x0C23; }
  get UNPACK_ALIGNMENT(): u32 { return 0x0CF5; }
  get PACK_ALIGNMENT(): u32 { return 0x0D05; }
  get MAX_TEXTURE_SIZE(): u32 { return 0x0D33; }
  get MAX_VIEWPORT_DIMS(): u32 { return 0x0D3A; }
  get SUBPIXEL_BITS(): u32 { return 0x0D50; }
  get RED_BITS(): u32 { return 0x0D52; }
  get GREEN_BITS(): u32 { return 0x0D53; }
  get BLUE_BITS(): u32 { return 0x0D54; }
  get ALPHA_BITS(): u32 { return 0x0D55; }
  get DEPTH_BITS(): u32 { return 0x0D56; }
  get STENCIL_BITS(): u32 { return 0x0D57; }
  get POLYGON_OFFSET_UNITS(): u32 { return 0x2A00; }
  get POLYGON_OFFSET_FACTOR(): u32 { return 0x8038; }
  get TEXTURE_BINDING_2D(): u32 { return 0x8069; }
  get SAMPLE_BUFFERS(): u32 { return 0x80A8; }
  get SAMPLES(): u32 { return 0x80A9; }
  get SAMPLE_COVERAGE_VALUE(): u32 { return 0x80AA; }
  get SAMPLE_COVERAGE_INVERT(): u32 { return 0x80AB; }
  get COMPRESSED_TEXTURE_FORMATS(): u32 { return 0x86A3; }
  get DONT_CARE(): u32 { return 0x1100; }
  get FASTEST(): u32 { return 0x1101; }
  get NICEST(): u32 { return 0x1102; }
  get GENERATE_MIPMAP_HINT(): u32 { return 0x8192; }
  get BYTE(): u32 { return 0x1400; }
  get UNSIGNED_BYTE(): u32 { return 0x1401; }
  get SHORT(): u32 { return 0x1402; }
  get UNSIGNED_SHORT(): u32 { return 0x1403; }
  get INT(): u32 { return 0x1404; }
  get UNSIGNED_INT(): u32 { return 0x1405; }
  get FLOAT(): u32 { return 0x1406; }
  get DEPTH_COMPONENT(): u32 { return 0x1902; }
  get ALPHA(): u32 { return 0x1906; }
  get RGB(): u32 { return 0x1907; }
  get RGBA(): u32 { return 0x1908; }
  get LUMINANCE(): u32 { return 0x1909; }
  get LUMINANCE_ALPHA(): u32 { return 0x190A; }
  get UNSIGNED_SHORT_4_4_4_4(): u32 { return 0x8033; }
  get UNSIGNED_SHORT_5_5_5_1(): u32 { return 0x8034; }
  get UNSIGNED_SHORT_5_6_5(): u32 { return 0x8363; }
  get FRAGMENT_SHADER(): u32 { return 0x8B30; }
  get VERTEX_SHADER(): u32 { return 0x8B31; }
  get MAX_VERTEX_ATTRIBS(): u32 { return 0x8869; }
  get MAX_VERTEX_UNIFORM_VECTORS(): u32 { return 0x8DFB; }
  get MAX_VARYING_VECTORS(): u32 { return 0x8DFC; }
  get MAX_COMBINED_TEXTURE_IMAGE_UNITS(): u32 { return 0x8B4D; }
  get MAX_VERTEX_TEXTURE_IMAGE_UNITS(): u32 { return 0x8B4C; }
  get MAX_TEXTURE_IMAGE_UNITS(): u32 { return 0x8872; }
  get MAX_FRAGMENT_UNIFORM_VECTORS(): u32 { return 0x8DFD; }
  get SHADER_TYPE(): u32 { return 0x8B4F; }
  get DELETE_STATUS(): u32 { return 0x8B80; }
  get LINK_STATUS(): u32 { return 0x8B82; }
  get VALIDATE_STATUS(): u32 { return 0x8B83; }
  get ATTACHED_SHADERS(): u32 { return 0x8B85; }
  get ACTIVE_UNIFORMS(): u32 { return 0x8B86; }
  get ACTIVE_ATTRIBUTES(): u32 { return 0x8B89; }
  get SHADING_LANGUAGE_VERSION(): u32 { return 0x8B8C; }
  get CURRENT_PROGRAM(): u32 { return 0x8B8D; }
  get NEVER(): u32 { return 0x0200; }
  get LESS(): u32 { return 0x0201; }
  get EQUAL(): u32 { return 0x0202; }
  get LEQUAL(): u32 { return 0x0203; }
  get GREATER(): u32 { return 0x0204; }
  get NOTEQUAL(): u32 { return 0x0205; }
  get GEQUAL(): u32 { return 0x0206; }
  get ALWAYS(): u32 { return 0x0207; }
  get KEEP(): u32 { return 0x1E00; }
  get REPLACE(): u32 { return 0x1E01; }
  get INCR(): u32 { return 0x1E02; }
  get DECR(): u32 { return 0x1E03; }
  get INVERT(): u32 { return 0x150A; }
  get INCR_WRAP(): u32 { return 0x8507; }
  get DECR_WRAP(): u32 { return 0x8508; }
  get VENDOR(): u32 { return 0x1F00; }
  get RENDERER(): u32 { return 0x1F01; }
  get VERSION(): u32 { return 0x1F02; }
  get NEAREST(): u32 { return 0x2600; }
  get LINEAR(): u32 { return 0x2601; }
  get NEAREST_MIPMAP_NEAREST(): u32 { return 0x2700; }
  get LINEAR_MIPMAP_NEAREST(): u32 { return 0x2701; }
  get NEAREST_MIPMAP_LINEAR(): u32 { return 0x2702; }
  get LINEAR_MIPMAP_LINEAR(): u32 { return 0x2703; }
  get TEXTURE_MAG_FILTER(): u32 { return 0x2800; }
  get TEXTURE_MIN_FILTER(): u32 { return 0x2801; }
  get TEXTURE_WRAP_S(): u32 { return 0x2802; }
  get TEXTURE_WRAP_T(): u32 { return 0x2803; }
  get TEXTURE(): u32 { return 0x1702; }
  get TEXTURE_CUBE_MAP(): u32 { return 0x8513; }
  get TEXTURE_BINDING_CUBE_MAP(): u32 { return 0x8514; }
  get TEXTURE_CUBE_MAP_POSITIVE_X(): u32 { return 0x8515; }
  get TEXTURE_CUBE_MAP_NEGATIVE_X(): u32 { return 0x8516; }
  get TEXTURE_CUBE_MAP_POSITIVE_Y(): u32 { return 0x8517; }
  get TEXTURE_CUBE_MAP_NEGATIVE_Y(): u32 { return 0x8518; }
  get TEXTURE_CUBE_MAP_POSITIVE_Z(): u32 { return 0x8519; }
  get TEXTURE_CUBE_MAP_NEGATIVE_Z(): u32 { return 0x851A; }
  get MAX_CUBE_MAP_TEXTURE_SIZE(): u32 { return 0x851C; }
  get TEXTURE0(): u32 { return 0x84C0; }
  get TEXTURE1(): u32 { return 0x84C1; }
  get TEXTURE2(): u32 { return 0x84C2; }
  get TEXTURE3(): u32 { return 0x84C3; }
  get TEXTURE4(): u32 { return 0x84C4; }
  get TEXTURE5(): u32 { return 0x84C5; }
  get TEXTURE6(): u32 { return 0x84C6; }
  get TEXTURE7(): u32 { return 0x84C7; }
  get TEXTURE8(): u32 { return 0x84C8; }
  get TEXTURE9(): u32 { return 0x84C9; }
  get TEXTURE10(): u32 { return 0x84CA; }
  get TEXTURE11(): u32 { return 0x84CB; }
  get TEXTURE12(): u32 { return 0x84CC; }
  get TEXTURE13(): u32 { return 0x84CD; }
  get TEXTURE14(): u32 { return 0x84CE; }
  get TEXTURE15(): u32 { return 0x84CF; }
  get TEXTURE16(): u32 { return 0x84D0; }
  get TEXTURE17(): u32 { return 0x84D1; }
  get TEXTURE18(): u32 { return 0x84D2; }
  get TEXTURE19(): u32 { return 0x84D3; }
  get TEXTURE20(): u32 { return 0x84D4; }
  get TEXTURE21(): u32 { return 0x84D5; }
  get TEXTURE22(): u32 { return 0x84D6; }
  get TEXTURE23(): u32 { return 0x84D7; }
  get TEXTURE24(): u32 { return 0x84D8; }
  get TEXTURE25(): u32 { return 0x84D9; }
  get TEXTURE26(): u32 { return 0x84DA; }
  get TEXTURE27(): u32 { return 0x84DB; }
  get TEXTURE28(): u32 { return 0x84DC; }
  get TEXTURE29(): u32 { return 0x84DD; }
  get TEXTURE30(): u32 { return 0x84DE; }
  get TEXTURE31(): u32 { return 0x84DF; }
  get ACTIVE_TEXTURE(): u32 { return 0x84E0; }
  get REPEAT(): u32 { return 0x2901; }
  get CLAMP_TO_EDGE(): u32 { return 0x812F; }
  get MIRRORED_REPEAT(): u32 { return 0x8370; }
  get FLOAT_VEC2(): u32 { return 0x8B50; }
  get FLOAT_VEC3(): u32 { return 0x8B51; }
  get FLOAT_VEC4(): u32 { return 0x8B52; }
  get INT_VEC2(): u32 { return 0x8B53; }
  get INT_VEC3(): u32 { return 0x8B54; }
  get INT_VEC4(): u32 { return 0x8B55; }
  get BOOL(): u32 { return 0x8B56; }
  get BOOL_VEC2(): u32 { return 0x8B57; }
  get BOOL_VEC3(): u32 { return 0x8B58; }
  get BOOL_VEC4(): u32 { return 0x8B59; }
  get FLOAT_MAT2(): u32 { return 0x8B5A; }
  get FLOAT_MAT3(): u32 { return 0x8B5B; }
  get FLOAT_MAT4(): u32 { return 0x8B5C; }
  get SAMPLER_2D(): u32 { return 0x8B5E; }
  get SAMPLER_CUBE(): u32 { return 0x8B60; }
  get VERTEX_ATTRIB_ARRAY_ENABLED(): u32 { return 0x8622; }
  get VERTEX_ATTRIB_ARRAY_SIZE(): u32 { return 0x8623; }
  get VERTEX_ATTRIB_ARRAY_STRIDE(): u32 { return 0x8624; }
  get VERTEX_ATTRIB_ARRAY_TYPE(): u32 { return 0x8625; }
  get VERTEX_ATTRIB_ARRAY_NORMALIZED(): u32 { return 0x886A; }
  get VERTEX_ATTRIB_ARRAY_POINTER(): u32 { return 0x8645; }
  get VERTEX_ATTRIB_ARRAY_BUFFER_BINDING(): u32 { return 0x889F; }
  get COMPILE_STATUS(): u32 { return 0x8B81; }
  get LOW_FLOAT(): u32 { return 0x8DF0; }
  get MEDIUM_FLOAT(): u32 { return 0x8DF1; }
  get HIGH_FLOAT(): u32 { return 0x8DF2; }
  get LOW_INT(): u32 { return 0x8DF3; }
  get MEDIUM_INT(): u32 { return 0x8DF4; }
  get HIGH_INT(): u32 { return 0x8DF5; }
  get FRAMEBUFFER(): u32 { return 0x8D40; }
  get RENDERBUFFER(): u32 { return 0x8D41; }
  get RGBA4(): u32 { return 0x8056; }
  get RGB5_A1(): u32 { return 0x8057; }
  get RGB565(): u32 { return 0x8D62; }
  get DEPTH_COMPONENT16(): u32 { return 0x81A5; }
  get STENCIL_INDEX8(): u32 { return 0x8D48; }
  get DEPTH_STENCIL(): u32 { return 0x84F9; }
  get RENDERBUFFER_WIDTH(): u32 { return 0x8D42; }
  get RENDERBUFFER_HEIGHT(): u32 { return 0x8D43; }
  get RENDERBUFFER_INTERNAL_FORMAT(): u32 { return 0x8D44; }
  get RENDERBUFFER_RED_SIZE(): u32 { return 0x8D50; }
  get RENDERBUFFER_GREEN_SIZE(): u32 { return 0x8D51; }
  get RENDERBUFFER_BLUE_SIZE(): u32 { return 0x8D52; }
  get RENDERBUFFER_ALPHA_SIZE(): u32 { return 0x8D53; }
  get RENDERBUFFER_DEPTH_SIZE(): u32 { return 0x8D54; }
  get RENDERBUFFER_STENCIL_SIZE(): u32 { return 0x8D55; }
  get FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE(): u32 { return 0x8CD0; }
  get FRAMEBUFFER_ATTACHMENT_OBJECT_NAME(): u32 { return 0x8CD1; }
  get FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL(): u32 { return 0x8CD2; }
  get FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE(): u32 { return 0x8CD3; }
  get COLOR_ATTACHMENT0(): u32 { return 0x8CE0; }
  get DEPTH_ATTACHMENT(): u32 { return 0x8D00; }
  get STENCIL_ATTACHMENT(): u32 { return 0x8D20; }
  get DEPTH_STENCIL_ATTACHMENT(): u32 { return 0x821A; }
  get FRAMEBUFFER_COMPLETE(): u32 { return 0x8CD5; }
  get FRAMEBUFFER_INCOMPLETE_ATTACHMENT(): u32 { return 0x8CD6; }
  get FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT(): u32 { return 0x8CD7; }
  get FRAMEBUFFER_INCOMPLETE_DIMENSIONS(): u32 { return 0x8CD9; }
  get FRAMEBUFFER_UNSUPPORTED(): u32 { return 0x8CDD; }
  get FRAMEBUFFER_BINDING(): u32 { return 0x8CA6; }
  get RENDERBUFFER_BINDING(): u32 { return 0x8CA7; }
  get MAX_RENDERBUFFER_SIZE(): u32 { return 0x84E8; }
  get INVALID_FRAMEBUFFER_OPERATION(): u32 { return 0x0506; }
  get UNPACK_FLIP_Y_WEBGL(): u32 { return 0x9240; }
  get UNPACK_PREMULTIPLY_ALPHA_WEBGL(): u32 { return 0x9241; }
  get CONTEXT_LOST_WEBGL(): u32 { return 0x9242; }
  get UNPACK_COLORSPACE_CONVERSION_WEBGL(): u32 { return 0x9243; }
  get BROWSER_DEFAULT_WEBGL(): u32 { return 0x9244; }
  get IMPLEMENTATION_COLOR_READ_TYPE(): u32 { return 0x8B9A; }
  get IMPLEMENTATION_COLOR_READ_FORMAT(): u32 { return 0x8B9B; }

  getError(): u32 { return __host_glGetError(this.ctx) as u32; }
  enable(cap: u32): void { __host_glEnable(this.ctx, cap); }
  disable(cap: u32): void { __host_glDisable(this.ctx, cap); }
  viewport(x: i32, y: i32, width: i32, height: i32): void { __host_glViewport(this.ctx, x, y, width, height); }
  clearColor(r: number, g: number, b: number, a: number): void { __host_glClearColor(this.ctx, r, g, b, a); }
  clear(mask: u32): void { __host_glClear(this.ctx, mask); }
  depthFunc(func: u32): void { __host_glDepthFunc(this.ctx, func); }
  cullFace(mode: u32): void { __host_glCullFace(this.ctx, mode); }

  createBuffer(): WebGLBuffer { return new WebGLBuffer(__host_glCreateBuffer(this.ctx)); }
  bindBuffer(target: u32, buffer: WebGLBuffer | null): void { __host_glBindBuffer(this.ctx, target, buffer === null ? 0 : buffer.id); }
  bufferData(target: u32, data: Float32Array | Uint16Array, usage: u32): void {
    if (data instanceof Float32Array) __host_glBufferDataF32(this.ctx, target, data.data, usage);
    else __host_glBufferDataU16(this.ctx, target, data.data, usage);
  }

  createShader(type: u32): WebGLShader { return new WebGLShader(__host_glCreateShader(this.ctx, type)); }
  shaderSource(shader: WebGLShader, source: string): void { __host_glShaderSource(this.ctx, shader.id, source); }
  compileShader(shader: WebGLShader): void { __host_glCompileShader(this.ctx, shader.id); }
  /** COMPILE_STATUS and DELETE_STATUS as 1 / 0, SHADER_TYPE as the type. */
  getShaderParameter(shader: WebGLShader, pname: u32): i32 { return __host_glGetShaderParameter(this.ctx, shader.id, pname); }
  getShaderInfoLog(shader: WebGLShader): string { return __host_glGetShaderInfoLog(this.ctx, shader.id); }
  createProgram(): WebGLProgram { return new WebGLProgram(__host_glCreateProgram(this.ctx)); }
  attachShader(program: WebGLProgram, shader: WebGLShader): void { __host_glAttachShader(this.ctx, program.id, shader.id); }
  linkProgram(program: WebGLProgram): void { __host_glLinkProgram(this.ctx, program.id); }
  /** LINK_STATUS, DELETE_STATUS, VALIDATE_STATUS as 1 / 0; ACTIVE_UNIFORMS, ACTIVE_ATTRIBUTES, ATTACHED_SHADERS as counts. */
  getProgramParameter(program: WebGLProgram, pname: u32): i32 { return __host_glGetProgramParameter(this.ctx, program.id, pname); }
  getProgramInfoLog(program: WebGLProgram): string { return __host_glGetProgramInfoLog(this.ctx, program.id); }
  useProgram(program: WebGLProgram | null): void { __host_glUseProgram(this.ctx, program === null ? 0 : program.id); }

  getAttribLocation(program: WebGLProgram, name: string): i32 { return __host_glGetAttribLocation(this.ctx, program.id, name); }
  enableVertexAttribArray(index: u32): void { __host_glEnableVertexAttribArray(this.ctx, index); }
  vertexAttribPointer(index: u32, size: i32, type: u32, normalized: boolean, stride: i32, offset: i32): void {
    __host_glVertexAttribPointer(this.ctx, index, size, type, normalized, stride, offset);
  }
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const id = __host_glGetUniformLocation(this.ctx, program.id, name);
    return id === 0 ? null : new WebGLUniformLocation(id);
  }
  uniform1i(location: WebGLUniformLocation | null, x: i32): void { if (location !== null) __host_glUniform1i(this.ctx, location.id, x); }
  uniform1f(location: WebGLUniformLocation | null, x: number): void { if (location !== null) __host_glUniform1f(this.ctx, location.id, x); }
  uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void { if (location !== null) __host_glUniform3f(this.ctx, location.id, x, y, z); }
  uniform4f(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void { if (location !== null) __host_glUniform4f(this.ctx, location.id, x, y, z, w); }
  uniformMatrix3fv(location: WebGLUniformLocation | null, transpose: boolean, value: number[]): void { if (location !== null) __host_glUniformMatrix3fv(this.ctx, location.id, transpose, value); }
  uniformMatrix4fv(location: WebGLUniformLocation | null, transpose: boolean, value: number[]): void { if (location !== null) __host_glUniformMatrix4fv(this.ctx, location.id, transpose, value); }

  createTexture(): WebGLTexture { return new WebGLTexture(__host_glCreateTexture(this.ctx)); }
  bindTexture(target: u32, texture: WebGLTexture | null): void { __host_glBindTexture(this.ctx, target, texture === null ? 0 : texture.id); }
  activeTexture(unit: u32): void { __host_glActiveTexture(this.ctx, unit); }
  texParameteri(target: u32, pname: u32, param: i32): void { __host_glTexParameteri(this.ctx, target, pname, param); }
  texImage2D(target: u32, level: i32, internalformat: u32, width: i32, height: i32, border: i32, format: u32, type: u32, pixels: Uint8Array | null): void {
    __host_glTexImage2D(this.ctx, target, level, internalformat, width, height, border, format, type, pixels === null ? [] : pixels.data);
  }
  generateMipmap(target: u32): void { __host_glGenerateMipmap(this.ctx, target); }

  drawArrays(mode: u32, first: i32, count: i32): void { __host_glDrawArrays(this.ctx, mode, first, count); }
  drawElements(mode: u32, count: i32, type: u32, offset: i32): void { __host_glDrawElements(this.ctx, mode, count, type, offset); }

  /** Copies the drawing buffer into the zinc:gfx image (resized to the drawing buffer): draw it with drawImage. Zinc's own, not WebGL. */
  present(image: i32): void { __host_glPresent(this.ctx, image); }
  /** Frees the context and its objects. */
  destroy(): void { __host_glDestroy(this.ctx); }
}

/** A WebGL 1 context of width x height pixels (version 2: WebGL 2, on GL 3.3 core or GLES 3); null when this machine or build has none. */
export function createContext(width: i32, height: i32, version: i32 = 1): WebGLRenderingContext | null {
  const ctx = __host_glCreate(width, height, version);
  return ctx === 0 ? null : new WebGLRenderingContext(ctx, width, height);
}
