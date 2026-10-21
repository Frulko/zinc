#!/bin/sh
# Points the demo at Carnet's packages (github.com/Frulko/carnet) the way pnpm links a workspace: node_modules/@nbe/<name> -> <dir>/<name>.
# Nothing is copied: update Carnet and the demo runs the new code.
#   ./link.sh                  ../../../notion-block-editor/packages (Carnet checked out beside zinc)
#   ./link.sh <packages dir>   another checkout
here=$(cd "$(dirname "$0")" && pwd)
src=$(cd "${1:-$here/../../../notion-block-editor/packages}" 2>/dev/null && pwd) || { echo "link: no Carnet packages at ${1:-../../../notion-block-editor/packages}" >&2; exit 1; }
mkdir -p "$here/node_modules/@nbe"
for p in core markdown collab dom; do
  [ -d "$src/$p/src" ] || { echo "link: $src/$p is not a Carnet package" >&2; exit 1; }
  ln -sfn "$src/$p" "$here/node_modules/@nbe/$p"
done
echo "carnet-nbe: @nbe/core, markdown, collab and dom from $src"
