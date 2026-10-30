#pragma once
// The interpreter's debugger (zinc debug, ZN-371.01, D84): breakpoints by file and line, step over / into / out, the call stack and the locals
// of a debug build (zbc::Module::lines, Function::vars, ClassInfo::fieldNames). The interpreter calls it at a Line instruction whose byte it set
// (Machine::lineHot); while the program is paused a front end inspects it and says how to go on. Includes rt and zbc; only main includes it.
#include <cstdint>
#include <functional>
#include <mutex>
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
struct Local {
  std::string name, type, value;
  std::string rawType;   // the IR type name (f64, bool, str, ref Point, f64[]...), what `type` is the source spelling of
  rt::Slot raw = 0;   // the value itself, for its children
  zbc::VType vt;
  bool expandable() const { return vt.cls == zbc::Cls::R && raw && !value.empty() && value[0] != '"' && value != "null"; }   // an object or an array
};

class Debugger {
 public:
  Debugger(const zbc::Module& mod, std::vector<std::string> sources);   // sources: the text of each file of mod.files
  void attach(rt::Machine& m);   // installs the hook; the program stops at its first statement unless runFirst() was called
  void runFirst();   // DAP without stopOnEntry: run to the first breakpoint
  // While paused, the front end runs and returns how the program goes on (also called when the program stops at a breakpoint).
  std::function<Resume(Debugger&)> paused;

  // Breakpoints: `file` matches a file's path or its trailing components ("main.ts", "src/main.ts"); the line is the first one with code at
  // or after `line`. 0 when there is no code there, else its number (1, 2...); `where` is where it landed.
  // `cond`: an expression that must hold for it to stop (an error in it stops, with the error); `log`: a message whose {expression} parts are
  // evaluated, sent to `logged` instead of stopping (ZN-371.05).
  int addBreakpoint(const std::string& file, std::uint32_t line, std::string& where, const std::string& cond = "", const std::string& log = "");
  bool removeBreakpoint(int id);
  std::function<void(const std::string&)> logged;   // a logpoint's message: the front end shows it
  void setExceptionPause(int mode);                  // 0 never, 1 an exception nothing catches, 2 every throw
  const std::string& exception() const { return exc_; }        // what was thrown, when reason() is "exception"
  const std::string& conditionError() const { return condErr_; }   // why a breakpoint's condition could not be evaluated (it stopped)
  void requestPause();   // from another thread: the program stops at its next statement (a front end's pause button)
  // Breakpoints, the pause request and the stepping state may change from a front end's reading thread while the program runs: they hold mu_.

  // The paused program: frame 0 is where it stopped, then its callers.
  std::vector<StackFrame> stack() const;
  std::vector<Local> locals(std::size_t frame) const;
  std::vector<Local> children(const Local& v) const;   // an object's fields, an array's elements (the first 100)
  std::vector<Local> closure(std::size_t frame) const;   // what an arrow function captured (a reassigned capture shows its value)
  std::vector<Local> globals() const;                   // the program's own top-level variables that functions use
  // An expression in a frame of the paused program (eval.cpp): its locals, its closure's captures, the program's globals; members, indexing,
  // .length, literals, unary, binary and logical operators, ?:. Typed by the declarations: a syntax error, Z0101 (unknown name), Z0106 (no such
  // property), Z0107 (operator on these types) or a call or assignment (not run) is an error in `err`.
  bool evaluate(const std::string& expr, std::size_t frame, Local& out, std::string& err) const;
  static bool truthy(const Local& v);
  const zbc::LineInfo* lineInfo(std::uint32_t line) const { return line < mod_.lines.size() ? &mod_.lines[line] : nullptr; }
  std::string filePath(std::uint32_t line) const { return line < mod_.lines.size() && mod_.lines[line].file < mod_.files.size() ? mod_.files[mod_.lines[line].file] : ""; }
  const char* reason() const { return reason_; }
  const zbc::Module& module() const { return mod_; }
  const std::vector<std::string>& sources() const { return sources_; }   // why it stopped: "entry", "breakpoint", "step", "pause"
  std::string where(std::uint32_t line) const;        // "main.ts:12"
  std::string sourceLine(std::uint32_t line) const;   // the text of that line
  std::string fnName(std::uint32_t fn) const;
  int hitBreakpoint() const { return hit_; }

 private:
  static bool hook(rt::Machine& m, const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, std::uint32_t line);
  static bool throwHook(rt::Machine& m, const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, rt::Slot exc);
  bool onLine(const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, std::uint32_t line);
  bool onThrow(const rt::Func* fn, const std::uint32_t* pc, rt::Slot* base, rt::Slot exc);
  bool pauseHere(std::uint32_t line);   // the front end runs; the next stop from what it said
  std::string interpolate(const std::string& log) const;
  bool frameScope(std::size_t frame, StackFrame& out) const;
  std::uint32_t lineAt(std::uint32_t fn, std::size_t pc) const;   // the statement a word of a function belongs to
  std::uint64_t key(std::uint32_t line) const { return static_cast<std::uint64_t>(mod_.lines[line].file) << 32 | mod_.lines[line].line; }
  std::size_t depth() const;
  void arm();   // the bytes of lineHot for the current mode
  std::string format(rt::Slot s, const zbc::VType& vt, const std::string& type, int depth) const;
  Local value(const std::string& name, rt::Slot s, const zbc::VType& vt, const std::string& type) const;

  const zbc::Module& mod_;
  std::vector<std::string> sources_;
  rt::Machine* m_ = nullptr;
  struct Bp { int id; std::uint64_t key; std::string cond, log; };
  std::vector<Bp> bps_;
  int nextId_ = 1, hit_ = 0;
  Resume mode_ = Resume::StepInto;   // the first statement stops
  std::uint64_t startKey_ = ~0ull;
  std::size_t startDepth_ = 0;
  bool pauseReq_ = false, first_ = true;
  int excMode_ = 0;
  std::string exc_, condErr_;
  const char* reason_ = "entry";
  std::mutex mu_;
  // where the program is paused
  const rt::Func* fn_ = nullptr;
  const std::uint32_t* pc_ = nullptr;
  rt::Slot* base_ = nullptr;
  std::uint32_t line_ = 0;
};

// The command-line front end of zinc debug: commands on standard input (echoed when it is not a terminal), answers on standard output.
Resume commandLine(Debugger& d);
void commandLineLog(const std::string& message);   // a logpoint's message on standard output

// zinc debug --dap (dap.cpp, ZN-371.02): the Debug Adapter Protocol on standard input and output, for VS Code.
struct Launch { std::string program, cwd; std::vector<std::string> args; bool stopOnEntry = false; };
bool dapStart(Launch& out);      // takes standard input and output over, answers initialize; the arguments of the launch request (false: the client left)
void dapReady(Debugger& d);      // the program is compiled and loaded: answers launch, sends initialized, waits for configurationDone
Resume dapPaused(Debugger& d);   // the front end of the paused program
void dapLog(const std::string& message);   // a logpoint's message: an output event

// zinc debug --cdp[=port] (cdp.cpp, ZN-371.04): Chrome DevTools' Sources panel, a target of the engine's own on 127.0.0.1.
bool cdpStart(int port, const std::string& program);   // listens (port 0: any free one) and says where on stderr; false when it cannot
void cdpReady(Debugger& d);      // the program is loaded: scripts for Debugger.enable; waits for a client's Runtime.runIfWaitingForDebugger
Resume cdpPaused(Debugger& d);   // Debugger.paused, then the client's requests until it resumes or steps
void cdpLog(const std::string& message);   // a logpoint's message: Runtime.consoleAPICalled
// A worker of the program (rt::worker::machineHook, on its thread): a debugger of its own on its machine and a target of its own (a session
// after Target.setAutoAttach, which waits for that session's Runtime.runIfWaitingForDebugger when asked); its end detaches it.
void cdpWorkerStart(rt::Machine& m, int id, const std::string& entry, const std::vector<std::string>& sources);
void cdpWorkerEnd(rt::Machine& m);

}  // namespace zn::dbg
