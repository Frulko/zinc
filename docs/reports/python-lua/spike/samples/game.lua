local on_frame, clear, rect, text, width, height = require("zinc.gfx")

---@class Ball
---@field x number
---@field y number
---@field vx number
---@field vy number
---@field color integer

---@type Ball[]
local balls = {}
for i = 1, 40 do
  table.insert(balls, { x = 10.0 + i * 6, y = 20.0 + i * 3, vx = 30.0 + i * 2, vy = 80.0 - i, color = 0x4080c0 + i * 0x030503 })
end

---@param b Ball
---@param dt number
local function update(b, dt)
  b.x = b.x + b.vx * dt
  b.y = b.y + b.vy * dt
  if b.x < 0 or b.x > width() - 12 then b.vx = -b.vx end
  if b.y < 0 or b.y > height() - 12 then b.vy = -b.vy end
end

on_frame(function(dt)
  clear(0x101820)
  for _, b in ipairs(balls) do
    update(b, dt)
    rect(b.x, b.y, 12, 12, b.color)
  end
  text(4, 4, #balls .. " balls, written in Lua", 0xffffff, 1)
end)
