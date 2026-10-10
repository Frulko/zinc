# gl-cube

A textured, lit cube drawn with `zinc:gl`, WebGL for compiled Zinc code (no JS engine), into a `zinc:gfx` image.

```sh
zinc run examples/gl-cube            # interpreted
zinc build examples/gl-cube -o cube  # native: WebGL is linked in
```

The rotation is a function of the frame number, so the interpreter and the native build draw the same frames (`tests/t1/gl_cube.sh`).
