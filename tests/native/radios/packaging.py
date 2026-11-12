#!/usr/bin/env python3
"""Stage only the production runtime-header copy rule, without building a package."""
import ast
import importlib.machinery
import pathlib
import shutil
import subprocess
import sys
root = pathlib.Path(__file__).resolve().parents[3]
stage = pathlib.Path(sys.argv[1]) / 'packaged'
package = importlib.machinery.SourceFileLoader('zinc_package', str(root / 'tools/package')).load_module()
# Execute the actual copy call/filter so a packaging-policy regression fails here.
tree = ast.parse((root / 'tools/package').read_text())
calls = [n for n in ast.walk(tree) if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
         and isinstance(n.value.func, ast.Name) and n.value.func.id == 'copy_tree'
         and ast.unparse(n.value.args[0]) == "os.path.join(REPO, 'runtime')"]
assert len(calls) == 1
exec(compile(ast.fix_missing_locations(ast.Module(body=calls, type_ignores=[])), 'package-runtime-copy', 'exec'),
     dict(package.__dict__, share=str(stage)))
header = stage / 'runtime/include/radio_dbus.h'
assert header.read_bytes() == (root / 'runtime/include/radio_dbus.h').read_bytes()
# An independently packed Wi-Fi plugin has no sibling radio directory.
plugin = stage / 'external/wifi'
shutil.copytree(root / 'plugins/wifi', plugin)
source = stage / 'include.cpp'
source.write_text('#include "network_manager.h"\nint main() { return 0; }\n')
subprocess.run(['c++', '-std=c++20', '-Wall', '-Wextra', '-Werror', '-fsyntax-only',
                '-I' + str(stage / 'runtime/include'), '-I' + str(plugin / 'native'), str(source)], check=True, timeout=10)
print('packaged radio header and external plugin include ok')
