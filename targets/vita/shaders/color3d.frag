#version 310 es

precision highp float;

// ZN-493 (first milestone): fragment of the 3D colour pair (see color3d.vert and README.md).

layout(location = 0) in vec4 vColor;

layout(location = 0) out vec4 fragColor;   // the UCHAR4 output register the patcher creates the program with

void main() {
    fragColor = vColor;
}
