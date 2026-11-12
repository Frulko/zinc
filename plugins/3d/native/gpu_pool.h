#pragma once
#include <stdint.h>
#include <stdlib.h>

namespace {

// Private GPU handles: 20 slot bits and 11 generation bits; exhausted slots retire instead of wrapping.
template<class T> struct GpuPool {
  enum class State : uint8_t { Vacant, Ready, Retired };
  struct Slot { T* value; uint32_t generation; State state; };
  Slot* slots = nullptr;
  int32_t n = 0;
  static constexpr uint32_t slotBits = 20, slotMask = (1u << slotBits) - 1, maxGeneration = 2047;
  GpuPool() = default;
  GpuPool(const GpuPool&) = delete;
  GpuPool& operator=(const GpuPool&) = delete;
  ~GpuPool() { free(slots); }
  static bool transition(Slot& slot, State to, T* value = nullptr) {
    if (slot.state == State::Vacant && to == State::Ready && value) { slot.value = value; slot.state = to; return true; }
    if (slot.state == State::Ready && !value && (to == State::Vacant || to == State::Retired)) {
      if ((to == State::Vacant && slot.generation >= maxGeneration) || (to == State::Retired && slot.generation != maxGeneration)) return false;
      slot.value = nullptr; slot.state = to;
      if (to == State::Vacant) ++slot.generation;
      return true;
    }
    return false;
  }
  int32_t add(T* value) {
    if (!value) return -1;
    int32_t i = 0;
    while (i < n && slots[i].state != State::Vacant) ++i;
    if (i == n) {
      if (uint32_t(n) > slotMask) return -1;
      Slot* grown = (Slot*)realloc(slots, sizeof(Slot) * size_t(n + 1));
      if (!grown) return -1;
      slots = grown; slots[n++] = Slot{nullptr, 0, State::Vacant};
    }
    return transition(slots[i], State::Ready, value) ? int32_t((slots[i].generation << slotBits) | uint32_t(i)) : -1;
  }
  T* at(int32_t id) const {
    const uint32_t i = uint32_t(id) & slotMask;
    return id >= 0 && i < uint32_t(n) && slots[i].state == State::Ready && slots[i].generation == uint32_t(id) >> slotBits ? slots[i].value : nullptr;
  }
  bool remove(int32_t id) {
    if (!at(id)) return false;
    Slot& slot = slots[uint32_t(id) & slotMask];
    return transition(slot, slot.generation == maxGeneration ? State::Retired : State::Vacant);
  }
};

} // namespace
