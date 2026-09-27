// Native modules (NAT). Two kinds:
//  - built-in `zinc:<name>` modules declared in lib/<name>.d.ts and implemented in runtime/mod/<name>.{h,cpp}
//    (functions -> zrt::<name>::fn, classes -> host objects zrt::<name>::Class);
//  - user modules: `native/<name>.spec.ts` exporting `requireNative<Spec>('Name')` (NAT-01/02), implemented in
//    `native/<name>.<target>.cpp` (C++) and `native/<name>.sim.ts` (sim). Calls are direct C++ virtual calls (NAT-04).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ts } from './frontend.ts';
import type { Sema, ZT } from './sema.ts';

export interface Emitter {
  args(as: readonly ts.Expression[], ps: ZT[]): string;
  hostCall(name: string, d: ts.SignatureDeclaration, e: ts.CallExpression): string;
  cpp(t: ZT): string;
}

/** NAT-13 availability table: using a module elsewhere is a compile error (NAT-09). */
const HOSTS = ['macos', 'linux', 'rpi1', 'sim'];
export const MODULE_TARGETS: Record<string, string[]> = {
  sys: [...HOSTS, 'esp32', 'ps2', 'ps1', 'wasm'], events: [...HOSTS, 'esp32', 'ps2', 'ps1', 'wasm'], assets: [...HOSTS, 'esp32', 'ps2', 'ps1', 'wasm'],
  // ponytail: esp32 variants (LittleFS, NVS, esp_http_client, GPIO driver) are not written yet
  storage: [...HOSTS], fs: [...HOSTS], telemetry: [...HOSTS, 'esp32'],
  net: [...HOSTS], osc: [...HOSTS, 'esp32'], mqtt: [...HOSTS, 'esp32'], gpio: [...HOSTS], native: [...HOSTS, 'esp32', 'ps2', 'ps1', 'wasm'], mem: [...HOSTS, 'esp32', 'ps2', 'ps1', 'wasm'],
};

export interface UserModule { name: string; spec: ts.SourceFile; iface: ts.InterfaceDeclaration; dir: string }

export class NativeModules {
  used = new Set<string>();
  user = new Map<string, UserModule>();
  s: Sema;

  constructor(s: Sema) {
    this.s = s;
    for (const sf of s.fe.sources) {
      if (!this.isSpecFile(sf)) continue;
      const def = sf.statements.find(ts.isExportAssignment);
      const call = def?.expression;
      if (!call || !ts.isCallExpression(call) || call.expression.getText() !== 'requireNative') s.fail(sf, 'Z5001', 'a native spec must `export default requireNative<Spec>(\'Name\')`');
      const c = call as ts.CallExpression;
      const name = (c.arguments[0] as ts.StringLiteral).text;
      const tn = c.typeArguments?.[0];
      const iface = tn && ts.isTypeReferenceNode(tn) ? s.declOf(tn.typeName) : undefined;
      if (!iface || !ts.isInterfaceDeclaration(iface)) s.fail(c, 'Z5001', 'requireNative needs an interface type argument');
      this.user.set(sf.fileName, { name, spec: sf, iface: iface as ts.InterfaceDeclaration, dir: path.dirname(sf.fileName) });
    }
  }

  isSpecFile(sf: ts.SourceFile) { return sf.fileName.endsWith('.spec.ts'); }
  isRequire(e: ts.Expression) { return ts.isCallExpression(e) && e.expression.getText() === 'requireNative'; }

  includes(): string[] {
    return [...[...this.used].map(m => `#include "mod/${m}.h"`), ...[...this.user.values()].map(u => `#include "zinc_native_${u.name.toLowerCase()}.h"`)];
  }
  inits(): string[] {
    return [...this.user.values()].map(u => `  zn_${u.name} = zinc_create_${u.name}();`);
  }

  /** Default import of a user spec module -> its instance pointer. */
  valueRef(e: ts.Identifier, d: ts.Node): string | undefined {
    if (ts.isImportClause(d) || ts.isExportAssignment(d)) {
      const u = this.userOf(d.getSourceFile().fileName === e.getSourceFile().fileName ? e : d);
      if (u) return `zn_${u.name}`;
    }
    const sym = this.s.checker.getSymbolAtLocation(e);
    const raw = sym?.declarations?.[0];
    if (raw && ts.isImportClause(raw)) {
      const spec = (raw.parent.moduleSpecifier as ts.StringLiteral).text;
      const file = path.resolve(path.dirname(e.getSourceFile().fileName), spec.replace(/\.ts$/, '') + '.ts');
      const u = this.user.get(file);
      if (u) return `zn_${u.name}`;
    }
    return undefined;
  }
  private userOf(n: ts.Node): UserModule | undefined { return this.user.get(n.getSourceFile().fileName); }

  member(_e: ts.PropertyAccessExpression): string | undefined { return undefined; }

  /** Calls into built-in modules or user native modules. */
  call(e: ts.CallExpression, em: Emitter): string | undefined {
    const c = e.expression;
    // user module method: Gpio.setup(...)
    if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)) {
      const ref = this.valueRef(c.expression, this.s.declOf(c.expression) ?? c.expression);
      if (ref) {
        const md = this.s.declOf(c.name);
        if (md && (ts.isMethodSignature(md) || ts.isMethodDeclaration(md)))
          return `${ref}->${c.name.text}(${em.args(e.arguments, md.parameters.map(p => this.s.paramType(p)))})`;
      }
    }
    // built-in module function: import { readText } from 'zinc:fs'
    const d = this.s.declOf(ts.isPropertyAccessExpression(c) ? c.name : c);
    if (d && ts.isFunctionDeclaration(d)) {
      const mod = this.s.libModule(d);
      if (mod && mod !== 'gfx') {
        this.used.add(mod);
        return em.hostCall(`zrt::${mod}::${d.name!.text}`, d, e);
      }
    }
    return undefined;
  }

  /** NAT-02: generated C++ interface for every user module, written next to the program. */
  writeHeaders(outDir: string, emitType: (t: ZT) => string): string[] {
    const files: string[] = [];
    fs.mkdirSync(outDir, { recursive: true });
    for (const u of this.user.values()) {
      const lines = [`// Generated by zinc codegen from ${path.basename(u.spec.fileName)}. Implement per target.`, '#pragma once', '#include "zrt.h"', ''];
      lines.push(`struct Native${u.name} : zrt::Object {`);
      for (const m of u.iface.members) {
        if (ts.isMethodSignature(m)) {
          const ps = m.parameters.map(p => `${emitType(this.s.paramType(p))} ${p.name.getText()}`).join(', ');
          lines.push(`  virtual ${emitType(this.s.retOf(m))} ${m.name.getText()}(${ps}) = 0;`);
        } else if (ts.isPropertySignature(m)) {
          lines.push(`  ${emitType(this.s.declType(m))} ${m.name.getText()}{};`);
        }
      }
      lines.push('};', `Native${u.name}* zinc_create_${u.name}();`, `static Native${u.name}* zn_${u.name};`, '');
      const f = path.join(outDir, `zinc_native_${u.name.toLowerCase()}.h`);
      fs.writeFileSync(f, lines.join('\n'));
      files.push(f);
    }
    return files;
  }
  /** Implementation files for a target: native/<name>.<target>.cpp (NAT-09). */
  sources(target: string): string[] {
    const out: string[] = [];
    for (const u of this.user.values()) {
      const base = path.basename(u.spec.fileName).replace(/\.spec\.ts$/, '');
      const f = path.join(u.dir, `${base}.${target}.cpp`);
      const fallback = path.join(u.dir, `${base}.host.cpp`);
      if (fs.existsSync(f)) out.push(f);
      else if ((target === 'macos' || target === 'linux') && fs.existsSync(fallback)) out.push(fallback);
      else this.s.fail(u.spec, 'Z5002', `native module '${u.name}' has no implementation for target '${target}' (expected ${path.relative(process.cwd(), f)})`);
    }
    return out;
  }
}
