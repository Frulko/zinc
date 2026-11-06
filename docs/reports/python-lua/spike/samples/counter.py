from zinc.ui.solid import render, create_signal, View, Text
from zinc.ui.kit import Button

count, set_count = create_signal(0)


def App():
    return View(
        Text(f"Count: {count()}", class_name="text-4xl font-bold text-white"),
        Text("Written in Python", class_name="text-gray-400"),
        Button(label="Add one", on_click=lambda: set_count(count() + 1)),
        class_name="w-full h-full items-center justify-center gap-4 bg-gray-900",
    )


render(App, 0x111827, None)
