---@param n integer
---@return integer
local function fib(n)
  if n < 2 then return n end
  return fib(n - 1) + fib(n - 2)
end

---@return integer
local function mandelbrot()
  ---@type integer
  local checksum = 0
  for py = 0, 399 do
    ---@type number
    local y0 = (py / 400) * 3.0 - 1.5
    for px = 0, 399 do
      ---@type number
      local x0 = (px / 400) * 3.0 - 2.0
      ---@type number
      local x = 0.0
      ---@type number
      local y = 0.0
      ---@type integer
      local n = 0
      while x * x + y * y <= 4.0 and n < 200 do
        local xt = x * x - y * y + x0
        y = 2.0 * x * y + y0
        x = xt
        n = n + 1
      end
      checksum = checksum + n
    end
  end
  return checksum
end

---@class Body
---@field x number
---@field y number
---@field z number
---@field vx number
---@field vy number
---@field vz number
---@field mass number

---@param steps integer
---@return number
local function nbody(steps)
  local sm = 4.0 * math.pi * math.pi
  local d = 365.24
  ---@type Body[]
  local bodies = {
    { x = 0.0, y = 0.0, z = 0.0, vx = 0.0, vy = 0.0, vz = 0.0, mass = sm },
    { x = 4.84143144246472090e+00, y = -1.16032004402742839e+00, z = -1.03622044471123109e-01, vx = 1.66007664274403694e-03 * d, vy = 7.69901118419740425e-03 * d, vz = -6.90460016972063023e-05 * d, mass = 9.54791938424326609e-04 * sm },
    { x = 8.34336671824457987e+00, y = 4.12479856412430479e+00, z = -4.03523417114321381e-01, vx = -2.76742510726862411e-03 * d, vy = 4.99852801234917238e-03 * d, vz = 2.30417297573763262e-05 * d, mass = 2.85885980666130812e-04 * sm },
    { x = 1.28943695621391310e+01, y = -1.51111514016986312e+01, z = -2.23307578892655734e-01, vx = 2.96460137564761618e-03 * d, vy = 2.37847173959480950e-03 * d, vz = -2.96589568540237556e-05 * d, mass = 4.36624404335156298e-05 * sm },
    { x = 1.53796971148509165e+01, y = -2.59193146099879641e+01, z = 1.79258772950371181e-01, vx = 2.68067772490389322e-03 * d, vy = 1.62824170038242295e-03 * d, vz = -9.51592254519715870e-05 * d, mass = 5.15138902046611451e-05 * sm },
  }
  local n = #bodies
  for s = 1, steps do
    for i = 1, n do
      local a = bodies[i]
      for j = i + 1, n do
        local b = bodies[j]
        local dx = a.x - b.x
        local dy = a.y - b.y
        local dz = a.z - b.z
        local d2 = dx * dx + dy * dy + dz * dz
        local mag = 0.01 / (d2 * math.sqrt(d2))
        a.vx = a.vx - dx * b.mass * mag
        a.vy = a.vy - dy * b.mass * mag
        a.vz = a.vz - dz * b.mass * mag
        b.vx = b.vx + dx * a.mass * mag
        b.vy = b.vy + dy * a.mass * mag
        b.vz = b.vz + dz * a.mass * mag
      end
    end
    for k = 1, n do
      local c = bodies[k]
      c.x = c.x + 0.01 * c.vx
      c.y = c.y + 0.01 * c.vy
      c.z = c.z + 0.01 * c.vz
    end
  end
  return bodies[1].x
end

print(fib(32))
print(mandelbrot())
print(nbody(600000))
