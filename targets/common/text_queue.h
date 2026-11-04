#pragma once
#include <deque>
#include <string>
#include "hal.h"

// The UI thread enqueues commits; the renderer drains complete UTF-8 sequences.
// The caller protects the queue while crossing threads.
class HalTextQueue {
  struct Event { int key; std::string text; };
  std::deque<Event> events;
public:
  void text(std::string value) { if (!value.empty()) events.push_back({0, std::move(value)}); }
  void key(int code) { events.push_back({code, {}}); }
  void drain(HalInput& input) {
    while (!events.empty() && input.nkeys < HAL_MAX_KEYS) {
      auto& event = events.front();
      if (event.key) {
        if (input.nkeys + 2 > HAL_MAX_KEYS) break;
        input.keys[input.nkeys++] = {event.key, 0, HAL_KEY_DOWN, 0, 0};
        input.keys[input.nkeys++] = {event.key, 0, HAL_KEY_UP, 0, 0};
      } else {
        size_t n = event.text.size(), room = HAL_TEXT_BYTES - input.ntext;
        if (n > room) {
          n = room;
          while (n && (static_cast<unsigned char>(event.text[n]) & 0xc0) == 0x80) --n;
        }
        if (!n) break;
        input.keys[input.nkeys++] = {0, 0, HAL_KEY_TEXT, static_cast<uint16_t>(input.ntext), static_cast<uint16_t>(n)};
        memcpy(input.text + input.ntext, event.text.data(), n);
        input.ntext += n;
        event.text.erase(0, n);
        if (!event.text.empty()) break;
      }
      events.pop_front();
    }
  }
};
