// binary-trees: Benchmarks Game kernel, class-based, recursive alloc-heavy
// workload. maxDepth tuned down from the canonical 16-21 range to 10 so the
// total node count (~400K allocations) finishes quickly across all engines,
// including the QuickJS interpreter and Zinc's reference-counted allocator;
// see docs/reports/PERF.md for the deviation rationale.
const MIN_DEPTH: i32 = 4;
const MAX_DEPTH: i32 = 10;

class TreeNode {
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(left: TreeNode | null, right: TreeNode | null) {
    this.left = left;
    this.right = right;
  }
}

function bottomUpTree(depth: i32): TreeNode {
  if (depth > 0) return new TreeNode(bottomUpTree(depth - 1), bottomUpTree(depth - 1));
  return new TreeNode(null, null);
}

function itemCheck(node: TreeNode): i32 {
  if (node.left === null) return 1;
  const l = node.left;
  const r = node.right;
  if (r === null) return 1;
  return 1 + itemCheck(l) + itemCheck(r);
}

let checksum: i32 = 0;

const stretchDepth: i32 = MAX_DEPTH + 1;
const stretchTree: TreeNode = bottomUpTree(stretchDepth);
checksum += itemCheck(stretchTree);

const longLivedTree: TreeNode = bottomUpTree(MAX_DEPTH);

for (let depth: i32 = MIN_DEPTH; depth <= MAX_DEPTH; depth += 2) {
  const iterations: i32 = 1 << (MAX_DEPTH - depth + MIN_DEPTH);
  let sum: i32 = 0;
  for (let i: i32 = 0; i < iterations; i++) {
    sum += itemCheck(bottomUpTree(depth));
    sum += itemCheck(bottomUpTree(depth + 1));
  }
  checksum += sum;
}

checksum += itemCheck(longLivedTree);
console.log(checksum);
