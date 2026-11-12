#pragma once
#include "radio_dbus.h"
#include <cassert>
#include <deque>
#include <map>
namespace zinc::radio {
struct sd_bus {};
struct sd_bus_slot { Handler callback; void* data; bool cancelled = false; };
struct sd_bus_message {
  std::string destination, path, interface, member, signature, error, errorMessage;
  size_t slotIndex = 0;
  std::vector<Value> values;
  struct Cursor { std::vector<Value>* values; size_t pos; };
  std::vector<Cursor> readers;
  std::vector<Value*> writers;
  sd_bus_error err{};
};
struct FakeBus {
  Api api{};
  std::deque<sd_bus_message> requests;
  std::vector<std::unique_ptr<sd_bus_slot>> slots;
  std::deque<std::pair<sd_bus_slot*, sd_bus_message>> replies;
  size_t processed = 0, destroyed = 0;
  int transportError = 0;
  static inline FakeBus* current = nullptr;
  FakeBus() {
    current = this;
    api.new_bus = [](sd_bus** b) { *b = new sd_bus; return 0; };
    api.set_address = [](sd_bus*, const char* s) { assert(std::string(s) == "unix:path=/run/dbus/system_bus_socket"); return 0; };
    api.set_bus_client = [](sd_bus*, int n) { assert(n == 1); return 0; };
    api.start = [](sd_bus*) { return 0; };
    api.close_unref = [](sd_bus* b) -> sd_bus* { delete b; return nullptr; };
    api.slot_unref = [](sd_bus_slot* s) -> sd_bus_slot* { assert(!s->cancelled); s->cancelled = true; current->destroyed++; return nullptr; };
    api.message_unref = [](sd_bus_message* m) -> sd_bus_message* { delete m; return nullptr; };
    api.new_call = [](sd_bus*, sd_bus_message** out, const char* dest, const char* path, const char* interface, const char* member) {
      *out = new sd_bus_message; (*out)->destination = dest; (*out)->path = path; (*out)->interface = interface; (*out)->member = member; return 0;
    };
    api.append_basic = [](sd_bus_message* m, char type, const void* p) {
      Value v; v.type = type;
      switch (type) {
        case 's': case 'o': case 'g': v.text = static_cast<const char*>(p); break;
        case 'y': v.number = *static_cast<const uint8_t*>(p); break;
        case 'n': case 'q': v.number = *static_cast<const uint16_t*>(p); break;
        case 'b': case 'u': case 'i': v.number = *static_cast<const uint32_t*>(p); break;
        default: v.number = *static_cast<const uint64_t*>(p);
      }
      auto& values = m->writers.empty() ? m->values : m->writers.back()->children; values.push_back(std::move(v)); return 1;
    };
    api.open = [](sd_bus_message* m, char type, const char* contents) {
      auto& values = m->writers.empty() ? m->values : m->writers.back()->children;
      values.push_back(Value::container(type, contents, {})); m->writers.push_back(&values.back()); return 1;
    };
    api.close = [](sd_bus_message* m) { if (m->writers.empty()) return -1; m->writers.pop_back(); return 1; };
    api.call_async = [](sd_bus*, sd_bus_slot** out, sd_bus_message* m, Handler cb, void* data, uint64_t timeout) {
      assert(timeout > 0 && timeout <= 30000000); assert(m->writers.empty()); m->slotIndex = current->slots.size(); current->requests.push_back(*m); *out = current->slot(cb, data); return 0;
    };
    api.add_match_async = [](sd_bus*, sd_bus_slot** out, const char*, Handler cb, Handler installed, void* data) {
      assert(installed); *out = current->slot(cb, data); return 0;
    };
    api.process = [](sd_bus*, sd_bus_message**) {
      if (current->transportError) return current->transportError;
      if (current->replies.empty()) return 0;
      auto r = std::move(current->replies.front()); current->replies.pop_front();
      if (!r.first->cancelled) { r.second.readers = {{&r.second.values, 0}}; r.first->callback(&r.second, r.first->data, nullptr); }
      current->processed++; return 1;
    };
    api.is_error = [](sd_bus_message* m, const char*) { return m->error.empty() ? 0 : 1; };
    api.get_error = [](sd_bus_message* m) -> const sd_bus_error* { m->err = {m->error.c_str(), m->errorMessage.c_str(), 0}; return &m->err; };
    api.get_errno = [](sd_bus_message*) { return 13; };
    api.signature = [](sd_bus_message* m, int) { return m->signature.c_str(); };
    api.path = [](sd_bus_message* m) { return m->path.c_str(); };
    api.interface = [](sd_bus_message* m) { return m->interface.c_str(); };
    api.member = [](sd_bus_message* m) { return m->member.c_str(); };
    api.peek = [](sd_bus_message* m, char* t, const char** c) {
      if (m->readers.empty()) m->readers = {{&m->values, 0}};
      auto& cursor = m->readers.back(); if (cursor.pos == cursor.values->size()) return 0;
      auto& v = (*cursor.values)[cursor.pos]; *t = v.type; *c = v.contents.c_str(); return 1;
    };
    api.read_basic = [](sd_bus_message* m, char t, void* out) {
      auto& c = m->readers.back(); auto& v = (*c.values)[c.pos++]; if (t != v.type) return -1;
      switch(t) {
        case 's': case 'o': case 'g': *static_cast<const char**>(out) = v.text.c_str(); break;
        case 'y': *static_cast<uint8_t*>(out) = v.number; break;
        case 'n': case 'q': *static_cast<uint16_t*>(out) = v.number; break;
        case 'b': case 'i': case 'u': *static_cast<uint32_t*>(out) = v.number; break;
        default: *static_cast<uint64_t*>(out) = v.number;
      }
      return 1;
    };
    api.enter = [](sd_bus_message* m, char t, const char* contents) {
      auto& c = m->readers.back(); auto& v = (*c.values)[c.pos++]; if (v.type != t || v.contents != contents) return -1;
      m->readers.push_back({&v.children, 0}); return 1;
    };
    api.exit = [](sd_bus_message* m) { auto c = m->readers.back(); if (c.pos != c.values->size()) return -1; m->readers.pop_back(); return 1; };
  }
  sd_bus_slot* slot(Handler cb, void* data) { auto p = std::make_unique<sd_bus_slot>(); p->callback = cb; p->data = data; auto* out = p.get(); slots.push_back(std::move(p)); return out; }
  sd_bus_message take(const std::string& member) { for (auto it = requests.begin(); it != requests.end(); ++it) if (it->member == member) { auto r = *it; requests.erase(it); return r; } assert(false); return {}; }
  void reply(size_t slot, std::string signature, std::vector<Value> values, std::string error = "") { assert(slot < slots.size()); sd_bus_message m; m.signature = signature; m.values = std::move(values); m.error = std::move(error); m.errorMessage = "secret-password"; replies.push_back({slots[slot].get(), std::move(m)}); }
};
}
