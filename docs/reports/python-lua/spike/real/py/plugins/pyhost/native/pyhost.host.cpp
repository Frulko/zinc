// Spike: the real CPython inside a Zinc program, on the plugin ABI. Zinc owns the main loop; Python runs when Zinc calls it, and calls Zinc through `_zinc.call`.
// ponytail: a table of callables that never shrinks and one numeric dispatcher; the product generates typed glue and releases handles.
#define PY_SSIZE_T_CLEAN
#include <Python.h>
#include <string>
#include "zinc_native_pyhost.h"

namespace {

zrt::Fn<double(int32_t, double, double, double, double, double, zrt::String)> gDispatch;
PyObject* gRefs;   // a list: a Zinc handle is an index

PyObject* pyCall(PyObject*, PyObject* args) {
  int fn; double a = 0, b = 0, c = 0, d = 0, e = 0; const char* s = "";
  if (!PyArg_ParseTuple(args, "i|ddddds", &fn, &a, &b, &c, &d, &e, &s)) return nullptr;
  return PyFloat_FromDouble(gDispatch(fn, a, b, c, d, e, zrt::String::from(s, static_cast<uint32_t>(strlen(s)))));
}
PyObject* pyRef(PyObject*, PyObject* f) {
  PyList_Append(gRefs, f);
  return PyLong_FromSsize_t(PyList_Size(gRefs) - 1);
}
PyMethodDef kMethods[] = {{"call", pyCall, METH_VARARGS, nullptr}, {"ref", pyRef, METH_O, nullptr}, {nullptr, nullptr, 0, nullptr}};
PyModuleDef kModule = {PyModuleDef_HEAD_INIT, "_zinc", nullptr, -1, kMethods};
PyObject* initZinc() { return PyModule_Create(&kModule); }

struct HostPyhost : NativePyhost {
  void start(zrt::String entry, zrt::String paths, zrt::Fn<double(int32_t, double, double, double, double, double, zrt::String)> dispatch) override {
    gDispatch = dispatch;
    PyImport_AppendInittab("_zinc", initZinc);
    Py_Initialize();
    gRefs = PyList_New(0);
    PyObject* path = PySys_GetObject("path");
    std::string all(paths.ptr(), paths.bytes());
    for (std::size_t at = 0; at <= all.size();) {
      std::size_t end = all.find(':', at);
      if (end == std::string::npos) end = all.size();
      PyObject* u = PyUnicode_FromStringAndSize(all.data() + at, static_cast<Py_ssize_t>(end - at));
      PyList_Insert(path, 0, u);
      Py_DECREF(u);
      at = end + 1;
    }
    std::string name(entry.ptr(), entry.bytes());
    PyObject* m = PyImport_ImportModule(name.c_str());
    if (!m) PyErr_Print();
    Py_XDECREF(m);
    PyEval_SaveThread();   // Python's threads run while Zinc draws
  }
  double invoke(int32_t id, double a) override {
    PyGILState_STATE g = PyGILState_Ensure();
    PyObject* r = PyObject_CallFunction(PyList_GetItem(gRefs, id), "d", a);
    double out = 0;
    if (!r) PyErr_Print();
    else { if (PyFloat_Check(r) || PyLong_Check(r)) out = PyFloat_AsDouble(r); Py_DECREF(r); }
    PyGILState_Release(g);
    return out;
  }
  zrt::String invokeStr(int32_t id) override {
    PyGILState_STATE g = PyGILState_Ensure();
    PyObject* r = PyObject_CallNoArgs(PyList_GetItem(gRefs, id));
    zrt::String out = zrt::String::from("", 0);
    if (!r) PyErr_Print();
    else {
      Py_ssize_t n;
      PyObject* t = PyObject_Str(r);
      const char* u = PyUnicode_AsUTF8AndSize(t, &n);
      out = zrt::String::from(u, static_cast<uint32_t>(n));
      Py_DECREF(t);
      Py_DECREF(r);
    }
    PyGILState_Release(g);
    return out;
  }
};

}  // namespace

NativePyhost* zinc_create_Pyhost() { static HostPyhost inst; return &inst; }
