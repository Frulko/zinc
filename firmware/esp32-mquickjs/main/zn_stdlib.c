/* The ROM standard library of the mquickjs firmware: the standard classes of mquickjs' own table (mqjs_stdlib.c) and the
   host calls of zinc:gfx (the functions `__host_gfx*` zinc:gfx's module calls) and of the board's modules (js/modules/*.js: zinc:gpio,
   zinc:storage...), as js/sim.js lists them for the check on the computer, in place of the REPL's globals (load, setTimeout: js/runtime.js). A host program: main/CMakeLists.txt
   compiles it with the computer's cc and runs it with -m32 to write zn_stdlib.h and mquickjs_atom.h for the ESP32's 32-bit words.
   The functions are named here and defined in main.c and the mod_*.c files. */
#define main mqjs_stdlib_main /* upstream's table and generator, kept for its class definitions only */
#define js_global_object mqjs_global_object
#define js_c_function_decl mqjs_c_function_decl
#include "mqjs_stdlib.c"
#undef main
#undef js_global_object
#undef js_c_function_decl

static const JSPropDef js_global_object[] = {
    JS_PROP_CLASS_DEF("Object", &js_object_class),
    JS_PROP_CLASS_DEF("Function", &js_function_class),
    JS_PROP_CLASS_DEF("Number", &js_number_class),
    JS_PROP_CLASS_DEF("Boolean", &js_boolean_class),
    JS_PROP_CLASS_DEF("String", &js_string_class),
    JS_PROP_CLASS_DEF("Array", &js_array_class),
    JS_PROP_CLASS_DEF("Math", &js_math_obj),
    JS_PROP_CLASS_DEF("Date", &js_date_class),
    JS_PROP_CLASS_DEF("JSON", &js_json_obj),
    JS_PROP_CLASS_DEF("RegExp", &js_regexp_class),

    JS_PROP_CLASS_DEF("Error", &js_error_class),
    JS_PROP_CLASS_DEF("EvalError", &js_eval_error_class),
    JS_PROP_CLASS_DEF("RangeError", &js_range_error_class),
    JS_PROP_CLASS_DEF("ReferenceError", &js_reference_error_class),
    JS_PROP_CLASS_DEF("SyntaxError", &js_syntax_error_class),
    JS_PROP_CLASS_DEF("TypeError", &js_type_error_class),
    JS_PROP_CLASS_DEF("URIError", &js_uri_error_class),
    JS_PROP_CLASS_DEF("InternalError", &js_internal_error_class),

    JS_PROP_CLASS_DEF("ArrayBuffer", &js_array_buffer_class),
    JS_PROP_CLASS_DEF("Uint8ClampedArray", &js_Uint8ClampedArray_class),
    JS_PROP_CLASS_DEF("Int8Array", &js_Int8Array_class),
    JS_PROP_CLASS_DEF("Uint8Array", &js_Uint8Array_class),
    JS_PROP_CLASS_DEF("Int16Array", &js_Int16Array_class),
    JS_PROP_CLASS_DEF("Uint16Array", &js_Uint16Array_class),
    JS_PROP_CLASS_DEF("Int32Array", &js_Int32Array_class),
    JS_PROP_CLASS_DEF("Uint32Array", &js_Uint32Array_class),
    JS_PROP_CLASS_DEF("Float32Array", &js_Float32Array_class),
    JS_PROP_CLASS_DEF("Float64Array", &js_Float64Array_class),

    JS_CFUNC_DEF("parseInt", 2, js_number_parseInt),
    JS_CFUNC_DEF("parseFloat", 1, js_number_parseFloat),
    JS_CFUNC_DEF("eval", 1, js_global_eval),
    JS_CFUNC_DEF("isNaN", 1, js_global_isNaN),
    JS_CFUNC_DEF("isFinite", 1, js_global_isFinite),

    JS_PROP_DOUBLE_DEF("Infinity", 1.0 / 0.0, 0),
    JS_PROP_DOUBLE_DEF("NaN", NAN, 0),
    JS_PROP_UNDEFINED_DEF("undefined", 0),
    JS_PROP_NULL_DEF("globalThis", 0), /* expanded as the global object */

    JS_PROP_CLASS_DEF("console", &js_console_obj),
    JS_PROP_CLASS_DEF("performance", &js_performance_obj),
    JS_CFUNC_DEF("print", 1, js_print),
    JS_CFUNC_DEF("gc", 0, js_gc),

    JS_CFUNC_DEF("__host_gfxWidth", 0, js_gfx_width),
    JS_CFUNC_DEF("__host_gfxHeight", 0, js_gfx_height),
    JS_CFUNC_DEF("__host_gfxPixelScale", 0, js_gfx_pixel_scale),
    JS_CFUNC_DEF("__host_gfxClear", 1, js_gfx_clear),
    JS_CFUNC_DEF("__host_gfxRect", 5, js_gfx_rect),
    JS_CFUNC_DEF("__host_gfxRRect", 7, js_gfx_rrect),
    JS_CFUNC_DEF("__host_gfxText", 5, js_gfx_text),
    JS_CFUNC_DEF("__host_gfxImage", 1, js_gfx_image),
    JS_CFUNC_DEF("__host_gfxKeep", 0, js_gfx_keep),
    JS_CFUNC_DEF("__host_gfxIsDown", 1, js_gfx_false),
    JS_CFUNC_DEF("__host_gfxWasPressed", 1, js_gfx_false),
    JS_CFUNC_DEF("__host_gfxPointerX", 0, js_gfx_pointer_x),
    JS_CFUNC_DEF("__host_gfxPointerY", 0, js_gfx_pointer_y),
    JS_CFUNC_DEF("__host_gfxPointerDown", 0, js_gfx_pointer_down),
    JS_CFUNC_DEF("__host_gfxTouchCount", 0, js_gfx_touch_count),
    JS_CFUNC_DEF("__host_gfxTouchX", 1, js_gfx_pointer_x),
    JS_CFUNC_DEF("__host_gfxTouchY", 1, js_gfx_pointer_y),

    JS_CFUNC_DEF("__host_gpioSetup", 3, js_gpio_setup), /* main/mod_gpio.c */
    JS_CFUNC_DEF("__host_gpioWrite", 2, js_gpio_write),
    JS_CFUNC_DEF("__host_gpioRead", 1, js_gpio_read),
    JS_CFUNC_DEF("__host_gpioWatch", 3, js_gpio_watch),

    JS_CFUNC_DEF("__host_storageGet", 1, js_storage_get), /* main/mod_storage.c */
    JS_CFUNC_DEF("__host_storageSet", 2, js_storage_set),
    JS_CFUNC_DEF("__host_storageRemove", 1, js_storage_remove),
    JS_CFUNC_DEF("__host_storageKeys", 0, js_storage_keys),
    JS_PROP_END,
};

static const JSPropDef js_c_function_decl[] = {
    JS_CFUNC_SPECIAL_DEF("bound", 0, generic_params, js_function_bound), /* must come first: Function.prototype.bind */
    JS_PROP_END,
};

int main(int argc, char **argv)
{
    return build_atoms("js_stdlib", js_global_object, js_c_function_decl, argc, argv);
}
