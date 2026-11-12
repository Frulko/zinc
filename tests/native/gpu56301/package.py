import ast, json, os, pathlib, shutil, subprocess, tempfile
root=pathlib.Path.cwd()
module=ast.parse((root/'tools/package').read_text())
copy=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='copy_tree')
payload=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='payload')
# Execute the real two payload operations, without staging unrelated engine/app/firmware files.
selected=[n for n in payload.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and isinstance(n.value.func,ast.Name) and n.value.func.id=='copy_tree' and any(isinstance(v,ast.Constant) and v.value in ('SDL3','glad') for v in ast.walk(n))]
assert len(selected)==2
payload.body=[ast.Assign(targets=[ast.Name(id='nx',ctx=ast.Store())],value=ast.Name(id='share',ctx=ast.Load()))]+selected
code=ast.fix_missing_locations(ast.Module(body=[copy,payload],type_ignores=[]))
namespace={'os':os,'shutil':shutil,'NEXT':str(root)}
exec(compile(code,'tools/package staged GL/SDL payload','exec'),namespace)
with tempfile.TemporaryDirectory() as tmp:
    namespace['payload'](tmp)
    dest=pathlib.Path(tmp)
    for folder in ['third_party/glad/include','third_party/SDL3/include/SDL3']:
        sources=list((root/folder).rglob('*.h'))
        for source in sources:
            target=dest/source.relative_to(root)
            assert target.read_bytes()==source.read_bytes(),str(target)
    assert (dest/'third_party/SDL3/LICENSE.txt').read_bytes()==(root/'third_party/SDL3/LICENSE.txt').read_bytes()
    assert not (dest/'third_party/SDL3/src').exists()
    probe=dest/'headers.cpp'
    probe.write_text('#include <SDL3/SDL.h>\n#include <glad/gl.h>\nint main() { return SDL_MAJOR_VERSION != 3 || GL_ES_VERSION_3_0 != 1; }\n')
    subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-fsyntax-only','-I',str(dest/'third_party/SDL3/include'),'-I',str(dest/'third_party/glad/include'),str(probe)],check=True)
    # Compile the production admission code with only the staged GL declarations.
    subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-I','tests/native/gpu56301','-I',str(dest/'third_party/glad/include'),'-I','.', 'tests/native/gpu56301/context.cpp','-o',str(dest/'context')],check=True)
    subprocess.run([str(dest/'context')],check=True)
manifest=json.loads((root/'plugins/3d/plugin.json').read_text())
assert manifest['native']['impl']['linux']=='native/render3d.gl.cpp'
assert not manifest['targets']['linux'].get('pkg') and not manifest['targets']['linux'].get('libs')
print('private loader, generations and staged GL/SDL header payload passed')
