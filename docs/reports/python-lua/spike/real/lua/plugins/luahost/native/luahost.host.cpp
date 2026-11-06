// Spike: real Lua inside a Zinc program, on the plugin ABI, the same shape as pyhost. C modules load through Lua's own `require`.
// ponytail: one numeric dispatcher, handles never released; the product generates typed glue.
#include <string>
#include "zinc_native_luahost.h"
extern "C" {
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
}

namespace {

zrt::Fn<double(int32_t, double, double, double, double, double, zrt::String)> gDispatch;
lua_State* L;

int luaCall(lua_State* s) {
  const char* str = luaL_optstring(s, 7, "");
  lua_pushnumber(s, gDispatch(static_cast<int32_t>(luaL_checkinteger(s, 1)), luaL_optnumber(s, 2, 0), luaL_optnumber(s, 3, 0), luaL_optnumber(s, 4, 0), luaL_optnumber(s, 5, 0),
                              luaL_optnumber(s, 6, 0), zrt::String::from(str, static_cast<uint32_t>(strlen(str)))));
  return 1;
}
int luaRef_(lua_State* s) {
  lua_settop(s, 1);
  lua_pushinteger(s, luaL_ref(s, LUA_REGISTRYINDEX));
  return 1;
}

struct HostLuahost : NativeLuahost {
  void start(zrt::String entry, zrt::String paths, zrt::Fn<double(int32_t, double, double, double, double, double, zrt::String)> dispatch) override {
    gDispatch = dispatch;
    L = luaL_newstate();
    luaL_openlibs(L);
    lua_newtable(L);
    lua_pushcfunction(L, luaCall); lua_setfield(L, -2, "call");
    lua_pushcfunction(L, luaRef_); lua_setfield(L, -2, "ref");
    lua_setglobal(L, "_zinc");
    std::string p(paths.ptr(), paths.bytes());
    lua_getglobal(L, "package"); lua_pushstring(L, p.c_str()); lua_setfield(L, -2, "path");
    lua_pushstring(L, "rocks/lib/?.so"); lua_setfield(L, -2, "cpath"); lua_pop(L, 1);
    std::string e(entry.ptr(), entry.bytes());
    if (luaL_dofile(L, e.c_str())) fprintf(stderr, "lua: %s\n", lua_tostring(L, -1));
  }
  double invoke(int32_t id, double a) override {
    lua_rawgeti(L, LUA_REGISTRYINDEX, id);
    lua_pushnumber(L, a);
    double out = 0;
    if (lua_pcall(L, 1, 1, 0)) fprintf(stderr, "lua: %s\n", lua_tostring(L, -1));
    else if (lua_isnumber(L, -1)) out = lua_tonumber(L, -1);
    lua_pop(L, 1);
    return out;
  }
  zrt::String invokeStr(int32_t id) override {
    lua_rawgeti(L, LUA_REGISTRYINDEX, id);
    zrt::String out = zrt::String::from("", 0);
    if (lua_pcall(L, 0, 1, 0)) fprintf(stderr, "lua: %s\n", lua_tostring(L, -1));
    else { size_t n; const char* u = luaL_tolstring(L, -1, &n); out = zrt::String::from(u, static_cast<uint32_t>(n)); lua_pop(L, 1); }
    lua_pop(L, 1);
    return out;
  }
};

}  // namespace

NativeLuahost* zinc_create_Luahost() { static HostLuahost inst; return &inst; }
