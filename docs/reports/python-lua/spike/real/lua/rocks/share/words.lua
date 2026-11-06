-- Stands in for a pure Lua rock.
return { plural = function(n, w) return n .. " " .. w .. (n == 1 and "" or "s") end }
