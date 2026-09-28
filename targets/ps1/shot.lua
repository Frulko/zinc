-- PCSX-Redux side of `zinc run --target ps1` with ZINC_SHOT=<file.bmp>: the HAL calls exec slot 1 (8-bit write to
-- 0x1f802081) after its last frame; this saves the displayed framebuffer as a 24-bit BMP.
PCSX.execSlots[1] = function()
  local path = os.getenv('ZINC_SHOT')
  if not path then return end
  local ss = PCSX.GPU.takeScreenShot()
  local w, h, px = ss.width, ss.height, tostring(ss.data)
  local pad = (4 - w * 3 % 4) % 4
  local function u32(v) return string.char(v % 256, math.floor(v / 256) % 256, math.floor(v / 65536) % 256, math.floor(v / 16777216)) end
  local out = { 'BM', u32(54 + (w * 3 + pad) * h), u32(0), u32(54), u32(40), u32(w), u32(h), string.char(1, 0, 24, 0), string.rep('\0', 24) }
  local c5 = {}
  for i = 0, 31 do c5[i] = math.floor(i * 255 / 31 + 0.5) end
  for y = h - 1, 0, -1 do
    local line = {}
    for x = 0, w - 1 do
      local i = (y * w + x) * 2 + 1
      local c = px:byte(i) + px:byte(i + 1) * 256  -- 15 bpp VRAM: R bits 0-4, G 5-9, B 10-14
      line[x + 1] = string.char(c5[math.floor(c / 1024) % 32], c5[math.floor(c / 32) % 32], c5[c % 32])
    end
    out[#out + 1] = table.concat(line) .. string.rep('\0', pad)
  end
  local f = io.open(path, 'wb')
  f:write(table.concat(out))
  f:close()
end
