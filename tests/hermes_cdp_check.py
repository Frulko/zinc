#!/usr/bin/env python3
"""Exercise the SDK's native CDP bridge in memory, without a server or Zinc host."""
import ctypes as C
import json
import sys
from collections import deque


def main(library):
    lib = C.CDLL(library)
    send_callback = C.CFUNCTYPE(None, C.c_void_p, C.c_size_t)
    wake_callback = C.CFUNCTYPE(None)
    signatures = {
        "zn_hermes_create": ([C.c_bool], C.c_void_p),
        "zn_hermes_set_debug": ([C.c_bool], None),
        "zn_hermes_run": ([C.c_void_p, C.c_char_p, C.c_size_t, C.c_char_p, C.c_bool, C.POINTER(C.c_void_p)], C.c_int),
        "zn_hermes_cdp_start": ([send_callback, wake_callback], C.c_bool),
        "zn_hermes_cdp_message": ([C.c_char_p, C.c_size_t], None),
        "zn_hermes_cdp_run": ([], None),
        "napi_open_handle_scope": ([C.c_void_p, C.POINTER(C.c_void_p)], C.c_int),
        "napi_close_handle_scope": ([C.c_void_p, C.c_void_p], C.c_int),
        "napi_get_and_clear_last_exception": ([C.c_void_p, C.POINTER(C.c_void_p)], C.c_int),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(lib, name)
        fn.argtypes, fn.restype = args, result

    messages, failures, pauses = [], [], deque()
    next_id = 0

    def command(method, params=None):
        nonlocal next_id
        next_id += 1
        raw = json.dumps({"id": next_id, "method": method, "params": params or {}}).encode()
        lib.zn_hermes_cdp_message(raw, len(raw))
        return next_id

    def response(request):
        message = next(m for m in messages if m.get("id") == request)
        assert "error" not in message, message
        return message["result"]

    @send_callback
    def received(data, size):
        message = json.loads(C.string_at(data, size))
        messages.append(message)
        if message.get("method") != "Debugger.paused":
            return
        try:
            assert pauses, f"unexpected pause: {message}"
            pause = message["params"]
            print("Debugger.paused:", pause["reason"], pause.get("hitBreakpoints"), flush=True)
            pauses.popleft()(pause)
        except Exception as error:
            failures.append(str(error))
            command("Debugger.resume")

    @wake_callback
    def wake():
        pass

    def request(method, params=None):
        request_id = command(method, params)
        lib.zn_hermes_cdp_run()
        return response(request_id)

    def no_hit(pause):
        assert not pause.get("hitBreakpoints"), pause
        command("Debugger.resume")

    env = lib.zn_hermes_create(False)
    assert env
    scope = C.c_void_p()
    assert lib.napi_open_handle_scope(env, C.byref(scope)) == 0
    lib.zn_hermes_set_debug(True)
    assert lib.zn_hermes_cdp_start(received, wake)

    def evaluate(source, url, status=0):
        value = C.c_void_p()
        raw = source.encode()
        assert lib.zn_hermes_run(env, raw, len(raw), url.encode(), False, C.byref(value)) == status
        assert not failures, failures
        assert not pauses, "expected pause did not occur"

    try:
        request("Debugger.enable")
        url_id = request("Debugger.setBreakpointByUrl", {"url": "native-hit.js", "lineNumber": 1})["breakpointId"]
        evaluate("function target() {\n var x = 1;\n x++;\n return x;\n}\n", "native-hit.js")
        script = next(m["params"] for m in messages if m.get("method") == "Debugger.scriptParsed" and m["params"]["url"] == "native-hit.js")
        location_request = None

        def url_hit(pause):
            assert pause.get("hitBreakpoints") == [url_id], pause
            print("matched URL breakpoint", url_id, flush=True)
            command("Debugger.stepOver")

        def step(pause):
            nonlocal location_request
            assert pause["reason"] == "step", pause
            assert not pause.get("hitBreakpoints"), pause
            command("Debugger.removeBreakpoint", {"breakpointId": url_id})
            location_request = command("Debugger.setBreakpoint", {"location": {"scriptId": script["scriptId"], "lineNumber": 3}})
            command("Debugger.resume")

        def location_hit(pause):
            location_id = response(location_request)["breakpointId"]
            assert location_id != url_id
            print("matched location breakpoint", location_id, flush=True)
            assert pause.get("hitBreakpoints") == [location_id], pause
            command("Debugger.removeBreakpoint", {"breakpointId": location_id})
            command("Debugger.resume")

        pauses.extend([url_hit, step, location_hit])
        evaluate("target();", "native-call.js")
        evaluate("target();", "native-removed.js")
        pauses.append(no_hit)
        evaluate("debugger; 1;", "native-debugger.js")
        request("Debugger.setPauseOnExceptions", {"state": "all"})
        def exception_pause(pause):
            assert pause["reason"] == "exception", pause
            no_hit(pause)

        pauses.append(exception_pause)
        evaluate("throw new Error('native exception');", "native-exception.js", 10)
        exception = C.c_void_p()
        assert lib.napi_get_and_clear_last_exception(env, C.byref(exception)) == 0
        assert not failures, failures
        print("PASS native Hermes CDP: URL/location IDs, step/debugger/exception/removal")
    finally:
        lib.zn_hermes_cdp_message(b"", 0)
        lib.zn_hermes_cdp_run()
        assert lib.napi_close_handle_scope(env, scope) == 0


if __name__ == "__main__":
    main(sys.argv[1])
