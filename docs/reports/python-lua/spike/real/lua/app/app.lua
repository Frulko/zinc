-- Real, dynamic Lua: metatables, coroutines across calls, load, a C module and a pure module through require, with Zinc's UI.
local zinc = require("zinc")
local nativecount = require("nativecount")   -- a C module built as LuaRocks builds one
local words = require("words")               -- a pure Lua module

local Vec = {}
Vec.__index = Vec
Vec.__add = function(a, b) return setmetatable({ x = a.x + b.x }, Vec) end
local v = setmetatable({ x = 1 }, Vec) + setmetatable({ x = 41 }, Vec)

local function deep() coroutine.yield(load("return 6 * 7")()) end
local co = coroutine.wrap(function() deep() end)   -- yield across a call: the static route refuses this

local clicks = zinc.signal(0)
local function App()
  return zinc.View { class_name = "w-full h-full items-center justify-center gap-4",
    zinc.Text { class_name = "text-gray-400", _VERSION .. ", metatable " .. v.x .. ", coroutine " .. co() },
    zinc.Text { class_name = "text-2xl font-bold text-white", function()
      return words.plural(math.tointeger(clicks()), "letter") .. " counted in C: " .. nativecount.count(string.rep("zinc", math.tointeger(clicks())))
    end },
    zinc.Button { label = "Add one", on_click = function() clicks:set(clicks() + 1) end },
  }
end

local c = os.clock()
for _ = 1, 200000 do zinc.call(0) end
print(string.format("boundary: %.0f ns per call from Lua into compiled Zinc", (os.clock() - c) / 200000 * 1e9))

if os.getenv("DEMO") == "particles" then
  local px, py, vx, vy = {}, {}, {}, {}
  for i = 1, 2000 do px[i], py[i], vx[i], vy[i] = math.random() * zinc.width(), math.random() * zinc.height(), (math.random() - 0.5) * 80, (math.random() - 0.5) * 80 end
  local n, total = 0, 0
  zinc.on_frame(function(dt)
    local t = os.clock()
    local w, h = zinc.width(), zinc.height()
    zinc.clear(0x101820)
    for i = 1, 2000 do
      px[i], py[i] = px[i] + vx[i] * dt, py[i] + vy[i] * dt
      if px[i] < 0 or px[i] > w then vx[i] = -vx[i] end
      if py[i] < 0 or py[i] > h then vy[i] = -vy[i] end
      zinc.rect(px[i], py[i], 2, 2, 0x60c0ff)
    end
    n, total = n + 1, total + os.clock() - t
    if n == 60 then print(string.format("per frame: %.2f ms", total / 60 * 1000)) end
  end)
else
  zinc.render(App)
  if os.getenv("AUTO") then zinc.on_tick(function() if clicks() < 12 then clicks:set(clicks() + 1) end end) end
end
