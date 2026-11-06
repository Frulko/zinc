local render, create_signal, View, Text = require("zinc.ui.solid")
local Button = require("zinc.ui.kit")

local count, set_count = create_signal(0)

function App()
  return View { class_name = "w-full h-full items-center justify-center gap-4 bg-gray-900",
    Text { class_name = "text-4xl font-bold text-white", "Count: " .. count() },
    Text { class_name = "text-gray-400", "Written in Lua" },
    Button { label = "Add one", on_click = function() set_count(count() + 1) end },
  }
end

render(App, 0x111827, nil)
