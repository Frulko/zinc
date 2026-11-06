-- What a generated `zinc` package looks like: plain Lua over the bridge.
local call, ref = _zinc.call, _zinc.ref
local M = { call = call }
function M.clear(c) call(1, c) end
function M.rect(x, y, w, h, c) call(2, x, y, w, h, c) end
function M.text(x, y, s, c, size) call(3, x, y, c or 0xffffff, size or 1, 0, s) end
function M.width() return call(4) end
function M.height() return call(5) end
function M.on_frame(f) call(6, ref(f)) end
function M.signal(v)
  local id = math.tointeger(call(20, v))
  return setmetatable({}, { __call = function() return call(21, id) end, __index = { set = function(_, x) call(22, id, x) end } })
end
local function class_of(n, t) if t.class_name then call(11, n, 0, 0, 0, 0, t.class_name) end end
function M.View(t)
  local n = call(10, 0)
  class_of(n, t)
  for _, k in ipairs(t) do call(12, n, k) end
  return n
end
function M.Text(t)
  local n = call(10, 1)
  class_of(n, t)
  if type(t[1]) == "function" then call(14, n, ref(t[1])) else call(13, n, 0, 0, 0, 0, tostring(t[1])) end
  return n
end
function M.Button(t) return call(15, ref(function() t.on_click() end), 0, 0, 0, 0, t.label) end
function M.render(app) call(30, ref(function() return app() end)) end
function M.on_tick(f) call(31, ref(f)) end
return M
