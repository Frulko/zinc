// One native export description consumed by both interpreter adapters.
// The v3 adapter admits scalar values, resource handles, callbacks, byte snapshots and scalar record results.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ts, ZINC_ROOT } from './frontend.ts';
import { NativeModules } from './native.ts';
import type { Sema, ZT } from './sema.ts';

export const ABI_VERSION = 3;
export const ABI_TYPES = ['void', 'bool', 'i32', 'u32', 'f32', 'f64', 'str', 'resource', 'fn', 'bytes', 'record', 'numbers'] as const;
export function abiType(t: ZT): number {
  const resource = t.k === 'obj' && ts.isInterfaceDeclaration(t.decl) && t.decl.name.text === 'NativeResource' && ts.isModuleBlock(t.decl.parent) && ts.isModuleDeclaration(t.decl.parent.parent) && t.decl.parent.parent.name.text === 'zinc:native';
  const name = t.k === 'arr' && t.el.k === 'num' && t.el.m === 'f64' ? 'numbers' : t.k === 'arr' && t.el.k === 'num' && t.el.m === 'u8' ? 'bytes' : resource ? 'resource' : t.k === 'obj' ? 'record' : t.k === 'num' ? t.m : t.k;
  const id = (ABI_TYPES as readonly string[]).indexOf(name);
  if (id < 0) throw new Error(`native ABI v3 does not yet support ${name}`);
  return id;
}
export function abiDefault(s: Sema, declaration: ts.SignatureDeclaration, parameter: ts.ParameterDeclaration): 'false' | '0' | undefined {
  if (!parameter.questionToken || !s.libModule(declaration)) return;
  if (s.paramType(parameter).k === 'bool') return 'false';
  if (s.libModule(declaration) === 'gfx' && declaration.name?.getText() === 'clip' && parameter.name.getText() === 'radius') return '0';
}
export interface AbiExport { module: string; name: string; parameters: number[]; result: number; record?: { name: string; type: number }[] }
export interface AbiResult { imports: Map<string, string>; exports: AbiExport[]; calls: Map<ts.Node, number>; sources: string[]; header: string }
export function emitAbi(s: Sema, dir: string, target: string): AbiResult {
  const native = new NativeModules(s);
  const imports = new Map<string, string>(), exports: AbiExport[] = [];
  const calls = new Map<ts.Node, number>();
  const lines = ['// Generated native ABI adapters. Do not edit.', '#include "abi.h"', '#include "zrt.h"', '#include <string>', '#include <memory>', `static_assert(ZINC_ABI_VERSION == ${ABI_VERSION}, "ABI generator/runtime version mismatch");`];
  const init: string[] = [];
  const cpp = (t: ZT): string => t.k === 'arr' && abiType(t) === 11 ? 'zrt::Array<double>' : t.k === 'obj' && abiType(t) === 10 ? `zrt::Ref<${s.libModule(t.decl) ? `zrt::${s.libModule(t.decl)}` : 'm_' + path.relative(s.root, t.decl.getSourceFile().fileName).replace(/\.[cm]?[jt]sx?$/, '').replace(/[^A-Za-z0-9]/g, '_')}::${(t.decl as ts.InterfaceDeclaration).name.text}>` : t.k === 'arr' && abiType(t) === 9 ? 'zrt::Array<uint8_t>' : t.k === 'fn' ? `zrt::Fn<${cpp(t.ret)}(${t.params.map(cpp).join(', ')})>` : ['void', 'bool', 'int32_t', 'uint32_t', 'float', 'double', 'zrt::String', 'zrt::Ref<zrt::native::NativeResource>'][abiType(t)];
  const callback = (t: ZT, index: number): string => {
    if (t.k !== 'fn' || [...t.params, t.ret].some(p => abiType(p) > 6)) throw new Error('native ABI: callbacks currently require scalar signatures');
    const values = t.params.map((p, j) => {
      const tag = abiType(p), field = tag === 2 ? 'integer' : tag === 1 || tag === 3 ? 'unsigned_integer' : 'number';
      return tag === 6 ? `values[${j}].type = 6; values[${j}].as.string = a${j}.ptr(); values[${j}].length = a${j}.bytes();` : `values[${j}].type = ${tag}; values[${j}].as.${field} = a${j};`;
    });
    const tag = abiType(t.ret), result = tag === 6 ? 'zrt::String::from(out.as.string, out.length)' : tag === 2 ? 'out.as.integer' : tag === 1 || tag === 3 ? 'out.as.unsigned_integer' : 'out.as.number';
    return `[ref = std::make_shared<zinc::CallbackRef>(self.registry->callbackLifetime, args[${index}].as.handle)](${t.params.map((p, j) => `${cpp(p)} a${j}`).join(', ')}) -> ${cpp(t.ret)} { ZincValue values[${Math.max(1, t.params.length)}]{}; ${values.join(' ')} try { auto out = ref->call(values, ${t.params.length}, ${tag}); ${tag ? `return ${result};` : ''} } catch (const std::exception& e) { zrt::g_err = zrt::make<zrt::Error>(zrt::String::from(e.what(), (uint32_t)strlen(e.what()))); ${tag ? 'return {};' : ''} } }`;
  };
  native.writeHeaders(dir, cpp);
  const builtins = new Map<string, Set<ts.FunctionDeclaration>>();
  const scan = (n: ts.Node) => {
    if (ts.isIdentifier(n)) {
      const d = s.declOf(n), module = d && s.libModule(d);
      if (d && ts.isFunctionDeclaration(d) && (module === 'sys' || module === 'fs' || module === 'gfx')) {
        if (['exit'].includes(d.name!.text)) throw new Error(`native ABI: ${module}.${d.name!.text} requires the shared application event loop`);
        if (!builtins.has(module)) builtins.set(module, new Set());
        builtins.get(module)!.add(d);
      }
    }
    ts.forEachChild(n, scan);
  };
  for (const sf of s.fe.sources) if (!sf.fileName.endsWith('.spec.ts')) scan(sf);
  const groups = [
    ...[...native.user.values()].map(u => ({ name: u.name, key: u.spec.fileName, module: 'zinc:native/' + u.name, members: [...u.iface.members] as ts.Node[], builtin: false })),
    ...[...builtins].map(([name, members]) => ({ name, key: 'zinc:' + name, module: 'zinc:' + name, members: [...members] as ts.Node[], builtin: true })),
  ];
  const names = new Set<string>();
  for (const u of groups) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(u.name) || names.has(u.name)) throw new Error(`native ABI: invalid or duplicate module name '${u.name}'`);
    names.add(u.name);
    const module = u.module;
    imports.set(u.key, module);
    lines.push(u.builtin ? (u.name === 'gfx' ? '// gfx declarations are in zrt.h' : `#include "mod/${u.name}.h"`) : `#include "zinc_native_${u.name.toLowerCase()}.h"`);
    const entries: string[] = [];
    const state = `abi_state_${imports.size}`;
    lines.push(`struct ${state} { ${u.builtin ? '' : `zrt::Ref<Native${u.name}> instance;`} zinc::Modules* registry; std::vector<ZincExport> exports; ZincModule module{}; };`);
    for (const m of u.members) {
      if (!ts.isMethodSignature(m) && !ts.isFunctionDeclaration(m)) throw new Error(`native ABI v3: ${u.name}: only methods are supported`);
      if (m.parameters.some(p => (p.questionToken && abiDefault(s, m, p) === undefined) || p.dotDotDotToken || p.initializer)) throw new Error(`native ABI v3: ${u.name}: optional/rest parameters are not supported`);
      const parameters = m.parameters.map(p => abiType(s.paramType(p))), result = abiType(s.retOf(m));
      if (!u.builtin && (parameters.includes(9) || result === 9)) throw new Error('native ABI: u8[] specs require a mutable buffer contract; byte snapshots currently support readonly fs/sys services only');
      if (result === 11 || (parameters.includes(11) && u.module !== 'zinc:gfx')) throw new Error('native ABI: number[] snapshots currently support readonly gfx arguments only');
      if (result === 8) throw new Error('native ABI: returned callbacks are not yet supported');
      const name = m.name!.getText();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('native ABI: invalid export name');
      const resultType = s.retOf(m);
      if (parameters.includes(10)) throw new Error('native ABI: record parameters require a mutable record contract; snapshots currently support return values only');
      let record: { name: string; type: number }[] | undefined;
      if (result === 10) {
        if (resultType.k !== 'obj' || !ts.isInterfaceDeclaration(resultType.decl)) throw new Error('native ABI: record results require a named interface');
        record = s.fieldNames(resultType.decl).map(name => ({ name, type: abiType(s.declType(s.memberDecl(resultType.decl, name)!)) }));
        if (record.length > 256 || record.some(f => !f.type || f.type > 6 || !/^[A-Za-z_$][\w$]*$/.test(f.name))) throw new Error('native ABI: record results require at most 256 named scalar fields');
        if (s.libModule(resultType.decl)) lines.push(`#include "mod/${s.libModule(resultType.decl)}.h"`);
      }
      const id = exports.length; calls.set(m, id); exports.push({ module, name, parameters, result, ...(record ? { record } : {}) });
      if (record) {
        lines.push(`static const ZincField abi_fields_${id}[${Math.max(1, record.length)}] = {${record.map(f => `{${JSON.stringify(f.name)}, ${f.type}}`).join(',')}};`);
        lines.push(`static const ZincRecord abi_record_${id} = {abi_fields_${id}, ${record.length}};`);
      }
      const args = parameters.map((t, i) => t === 11 ? `numbers_${i}` : t === 9 ? `bytes_${i}` : t === 8 ? callback(s.paramType(m.parameters[i]), i) : t === 7 ? `zrt::Ref<zrt::native::NativeResource>(static_cast<zrt::native::NativeResource*>(self.registry->resources.get(args[${i}].as.handle, ZINC_RESOURCE_ZRT)))` : t === 6 ? `zrt::String::from(args[${i}].as.string, args[${i}].length)` : t === 1 ? `args[${i}].as.unsigned_integer != 0` : t === 2 ? `args[${i}].as.integer` : t === 3 ? `args[${i}].as.unsigned_integer` : `args[${i}].as.number`);
      lines.push(`static int32_t abi_call_${id}(void* context, const ZincValue* args, uint32_t, ZincValue* out, ZincError* error) {`);
      lines.push(`  auto& self = *static_cast<${state}*>(context); try {`);
      for (const [i, tag] of parameters.entries()) if (tag === 11) lines.push(`  auto numbers_${i} = zrt::Array<double>::with_cap(args[${i}].length); for (uint32_t j=0; j<args[${i}].length; ++j) numbers_${i}.push_raw(args[${i}].as.numbers[j]);`);
      for (const [i, tag] of parameters.entries()) if (tag === 9) lines.push(`  auto bytes_${i} = zrt::Array<uint8_t>::with_cap(args[${i}].length); for (uint32_t j=0; j<args[${i}].length; ++j) bytes_${i}.push_raw(args[${i}].as.bytes[j]);`);
      lines.push(`  ${result ? 'auto result = ' : ''}${u.builtin ? `zrt::${u.name}::` : 'self.instance->'}${name}(${args.join(', ')});`);
      lines.push(`  if (zrt::g_err) { static thread_local std::string message; auto e = zrt::g_err; zrt::g_err = {}; auto text = e->message; message.assign(text.ptr(), text.bytes()); error->data = message.data(); error->length = (uint32_t)message.size(); return ZINC_HOST_ERROR; }`);
      lines.push(`  out->type = ${result};`);
      if (record) {
        lines.push('  if (!result) throw std::runtime_error("native record result is null");', `  static thread_local ZincValue fields[${Math.max(1, record.length)}]{};`);
        for (const [i, field] of record.entries()) {
          lines.push(`  fields[${i}].type = ${field.type};`);
          if (field.type === 6) lines.push(`  static thread_local std::string text_${i}; text_${i}.assign(result->${field.name}.ptr(), result->${field.name}.bytes()); fields[${i}].as.string = text_${i}.data(); fields[${i}].length = (uint32_t)text_${i}.size();`);
          else lines.push(`  fields[${i}].as.${field.type === 2 ? 'integer' : field.type === 1 || field.type === 3 ? 'unsigned_integer' : 'number'} = result->${field.name};`);
        }
        lines.push(`  out->as.record = fields; out->length = ${record.length};`);
      } else if (result === 9) lines.push('  static thread_local zrt::Array<uint8_t> bytes; bytes = std::move(result); out->as.bytes = bytes.a->data; out->length = (uint32_t)bytes.length();');
      else if (result === 7) lines.push('  out->as.handle = self.registry->resources.add(result.p, ZINC_RESOURCE_ZRT, [](void* p){ zrt::release(static_cast<zrt::native::NativeResource*>(p)); }); result.p = nullptr;');
      else if (result === 6) lines.push('  static thread_local std::string text; text.assign(result.ptr(), result.bytes()); out->as.string = text.data(); out->length = (uint32_t)text.size();');
      else if (result) lines.push(`  out->as.${result === 2 ? 'integer' : result === 1 || result === 3 ? 'unsigned_integer' : 'number'} = result;`);
      lines.push('  return ZINC_OK;', '  } catch (const std::exception& e) { static thread_local std::string message; message = e.what(); *error = {message.data(), (uint32_t)message.size()}; return ZINC_HOST_ERROR; } catch (...) { static const char message[] = "native adapter failed"; *error = {message, sizeof(message)-1}; return ZINC_HOST_ERROR; }', '}');
      if (parameters.length) lines.push(`static const uint32_t abi_params_${id}[] = {${parameters.join(',')}};`);
      entries.push(`{${JSON.stringify(name)}, ${parameters.length ? `abi_params_${id}` : 'nullptr'}, ${parameters.length}, ${result}, abi_call_${id}, nullptr, ${record ? `&abi_record_${id}` : 'nullptr'}}`);
    }
    const id = imports.size;
    lines.push(`static const std::vector<ZincExport> abi_exports_${id} = {${entries.join(',\n')}};`);

    init.push(`  if (!modules.find(${JSON.stringify(module)})) {
    auto state = std::make_unique<abi_state_${id}>(); state->registry = &modules;
    ${u.builtin ? '' : `state->instance = zrt::Ref<Native${u.name}>::adopt(zinc_create_${u.name}()); if (!state->instance) throw std::runtime_error("native module factory returned null");`}
    state->exports = abi_exports_${id}; for (auto& f : state->exports) f.context = state.get();
    state->module = {ZINC_ABI_VERSION, sizeof(ZincModule), ${JSON.stringify(module)}, state->exports.data(), (uint32_t)state->exports.size(), state.get(), [](void* p){ delete static_cast<abi_state_${id}*>(p); }};
    modules.add(state->module); state.release();
  }
  for (const auto& f : abi_exports_${id}) modules.require(${JSON.stringify(module)}, f);`);
  }
  lines.push('static void registerGeneratedModules(zinc::Modules& modules) {', ...init, '}');
  const header = path.join(dir, 'zinc_abi_generated.h');
  const text = lines.join('\n') + '\n';
  if (!fs.existsSync(header) || fs.readFileSync(header, 'utf8') !== text) fs.writeFileSync(header, text);
  fs.writeFileSync(path.join(dir, 'core.abi.json'), JSON.stringify({ version: ABI_VERSION, exports }, null, 2) + '\n');
  return { imports, exports, calls, sources: [...native.sources(target), ...[...builtins.keys()].filter(m => m !== 'gfx').map(m => path.join(ZINC_ROOT, 'runtime/mod', m + '.cpp'))], header };
}
