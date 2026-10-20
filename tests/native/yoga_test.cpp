// Yoga 3.2.1 links and lays out (ZN-280): two 80 px children in a 100 px row. With the web defaults (flex-shrink 1, what `rn` mode will set for CSS fidelity) they shrink to 50 px each;
// with shrink 0 (React Native's own default) they keep 80 px and overflow.
#include <cstdio>
#include <cstdlib>
#include <yoga/Yoga.h>

static int failures = 0;
#define CHECK(c) do { if (!(c)) { std::fprintf(stderr, "%s:%d: check failed: %s\n", __FILE__, __LINE__, #c); failures++; } } while (0)

static void row(float shrink, float expectW, float expectX2) {
  YGConfigRef cfg = YGConfigNew();
  YGNodeRef root = YGNodeNewWithConfig(cfg);
  YGNodeStyleSetFlexDirection(root, YGFlexDirectionRow);
  YGNodeStyleSetWidth(root, 100);
  YGNodeStyleSetHeight(root, 40);
  YGNodeRef kids[2];
  for (int i = 0; i < 2; i++) {
    kids[i] = YGNodeNewWithConfig(cfg);
    YGNodeStyleSetWidth(kids[i], 80);
    YGNodeStyleSetHeight(kids[i], 20);
    YGNodeStyleSetFlexShrink(kids[i], shrink);
    YGNodeInsertChild(root, kids[i], i);
  }
  YGNodeCalculateLayout(root, YGUndefined, YGUndefined, YGDirectionLTR);
  CHECK(YGNodeLayoutGetLeft(kids[0]) == 0 && YGNodeLayoutGetWidth(kids[0]) == expectW && YGNodeLayoutGetHeight(kids[0]) == 20);
  CHECK(YGNodeLayoutGetLeft(kids[1]) == expectX2 && YGNodeLayoutGetWidth(kids[1]) == expectW);
  YGNodeFreeRecursive(root);
  YGConfigFree(cfg);
}

int main() {
  row(1, 50, 50);   // web defaults: the two 80 px children share the 100 px
  row(0, 80, 80);   // React Native default: no shrink, the second child overflows to x = 80
  if (failures) return 1;
  std::puts("yoga ok");
}
