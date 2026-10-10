#pragma once
// The interpreter's debugger (zinc debug, ZN-371.01, D84): breakpoints by file and line, step over / into / out, the call stack and the locals
// of a debug build (zbc::Module::lines, Function::vars, ClassInfo::fieldNames). The interpreter calls it at a Line instruction whose byte it set
// (Machine::lineHot); while the program is paused a front end inspects it and says how to go on. Includes rt and zbc; only main includes it.
#include <cstdint>
#include <functional>
#include <set>
#include <string>
#include <vector>

#include "rt/rt.h"
#include "zbc/zbc.h"

namespace zn::dbg {

enum class Resume { Continue, StepOver, StepInto, StepOut, Stop };

struct StackFrame {
  std::uint32_t fn = 0;         // index in the module's functions
  std::uint32_t line = ~0u;     // index in Module::lines of the statement it is in, ~0u when unknown
  const rt::Slot* base = nullptr;
};
struct Local { std::string name, type, value; };

class Debugger {
 public:
  Debugger(const zbc::Module& mod, std::vector<std::string> sources);   // sources: the text of each file of mod.files
  void attach(rt::Machine& m);   // installs the hook; the program stops at its first statement
  // While paused, the front end runs and returns how the program goes on (also called when the program stops at a breakpoint).
  std::function<Resume(Debugger&)> paused;

  // Breakpoints: `file` matches a file's path or its trailing components ("main.ts", "src/main.ts"); the line is the first one with code at
  // or after `line`. 0 when there is no code there, else its number (1, 2...); `where` is where it landed.
  int addBreakpoint(const std::string& file, std::uint32_t line, std::string& where);
  bool removeBreakpoint(int id);

  // The paused program: frame 0 is where it stopped, then its callers.
  std::vector<StackFrame> stack() const;
  std::vector<Local> locals(std::size_t frame) const;
  std::string where(std::uint32_t line) const;        // "main.ts:12"
  std::string sourceLine(std::uint32_t line) const;   // the text of that line
  std::string fnName(std::uint32_t fn) const;
  int hitBreakpoint() const { return hit_; }

 private:
  static bool hook(rt::Machine& m, const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, std::uint32_t line);
  bool onLine(const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, std::uint32_t line);
  std::uint32_t lineAt(std::uint32_t fn, std::size_t pc) const;   // the statement a word of a function belongs to
  std::uint64_t key(std::uint32_t line) const { return static_cast<std::uint64_t>(mod_.lines[line].file) << 32 | mod_.lines[line].line; }
  std::size_t depth() const;
  void arm();   // the bytes of lineHot for the current mode
  std::string format(rt::Slot s, const zbc::VType& vt, const std::string& type, int depth) const;

  const zbc::Module& mod_;
  std::vector<std::string> sources_;
  rt::Machine* m_ = nullptr;
  struct Bp { int id; std::uint64_t key; };
  std::vector<Bp> bps_;
  int nextId_ = 1, hit_ = 0;
  Resume mode_ = Resume::StepInto;   // the first statement stops
  std::uint64_t startKey_ = ~0ull;
  std::size_t startDepth_ = 0;
  // where the program is paused
  const rt::Func* fn_ = nullptr;
  const std::uint32_t* pc_ = nullptr;
  rt::Slot* base_ = nullptr;
  std::uint32_t line_ = 0;
};

// The command-line front end of zinc debug: commands on standard input (echoed when it is not a terminal), answers on standard output.
Resume commandLine(Debugger& d);

}  // namespace zn::dbg
