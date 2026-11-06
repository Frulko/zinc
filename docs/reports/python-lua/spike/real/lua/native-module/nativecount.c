/* Stands in for a C rock: built the way LuaRocks builds one, against the headers, leaving the Lua symbols to the process that loads it. */
#include <lua.h>
#include <lauxlib.h>
static int count(lua_State *L) { size_t n; luaL_checklstring(L, 1, &n); lua_pushinteger(L, (lua_Integer)n); return 1; }
static const luaL_Reg fns[] = {{"count", count}, {0, 0}};
int luaopen_nativecount(lua_State *L) { luaL_newlib(L, fns); return 1; }
