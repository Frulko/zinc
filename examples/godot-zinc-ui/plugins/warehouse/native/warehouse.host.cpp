#include "zinc_native_warehouse.h"
extern "C" {
int warehouse_count = 0;
int warehouse_speed = 3;
int warehouse_action = 0;
}
struct Warehouse : NativeWarehouse {
  int32_t count() override { return warehouse_count; }
  int32_t speed() override { return warehouse_speed; }
  void action(int32_t kind, int32_t value) override {
    if (kind == 1 && warehouse_count > 0) warehouse_action = 1;
    if (kind == 2 && value >= 1 && value <= 5) warehouse_speed = value;
    if (kind == 3) warehouse_action = 3;
  }
};
NativeWarehouse* zinc_create_Warehouse() {
  static Warehouse bridge;
  bridge.rc = zrt::IMMORTAL;
  return &bridge;
}
