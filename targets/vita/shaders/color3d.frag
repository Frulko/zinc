// ZN-493 (first milestone): fragment of the 3D colour pair (see color3d.vert and README.md).

in vec4 vColor;

out vec4 fragColor;        // the UCHAR4 output register the patcher creates the program with

void main() {
    fragColor = vColor;
}
