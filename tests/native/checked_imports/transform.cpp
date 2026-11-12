#include "qjs/strip.h"
#include "frontend/resolve.h"
#include <cassert>
#include <map>
#include <string>
#include <iostream>
namespace zn::qjs { std::string webMode(const std::string&) { return ""; } }
int main() {
  std::map<std::string,std::string> files{
    {"/virtual/tsconfig.json", "{\"compilerOptions\":{\"moduleSuffixes\":[\"\"]}}"},
    {"/virtual/lib/types.ts", "export interface Row { id:string; child?:Row; }"},
    {"/virtual/lib/barrel.ts", "import type { Row as Hidden } from './types'; export type {Hidden as Renamed};"}
  };
  bool dormantRead=false;
  zn::qjs::CheckedTypeSources types;
  types.file="/virtual/std/root.ts";
  types.read=[&](const std::string& file,std::string& text) { dormantRead |= file.find("missing")!=std::string::npos; auto it=files.find(file);if(it==files.end())return false;text=it->second;return true; };
  zn::frontend::ModuleResolver resolver;
  resolver.read=types.read;
  resolver.exists=[&](const std::string& file) { return files.count(file); };
  types.resolve=[&](const std::string& spec,const std::string& from) {
    if(spec=="mapped")return std::string("/virtual/lib/barrel.ts");
    return resolver.file(zn::frontend::normalize(zn::frontend::dirOf(from)+"/"+spec),from);
  };
  const std::string source="import type * as api from 'mapped'; import type * as unused from './missing'; function dormant(x:unused.Never):void{} const row:api.Renamed=JSON.parse('{}');";
  std::string out,error;
  assert(zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.empty() && out.find("__dynAs('")!=std::string::npos && out.find("id:s")!=std::string::npos && !dormantRead);
  files["/virtual/lib/types.ts"]="export interface Row {";
  error.clear();
  assert(!zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.find("cannot parse checked JSON types")!=std::string::npos);
  files["/virtual/lib/types.ts"]="export interface Row { id:string; } /*"+std::string(17*1024*1024,' ')+"*/";
  error.clear();
  assert(!zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.find("budget")!=std::string::npos);
  files["/virtual/lib/types.ts"]="export type { Row } from './barrel';";
  error.clear();
  assert(!zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(!error.empty());
  files["/virtual/lib/types.ts"]="export interface Row {id:string;}";
  files["/virtual/lib/other.ts"]="export interface Row {count:number;}";
  files["/virtual/lib/ambiguous.ts"]="export type * from './types'; export type * from './other';";
  files["/virtual/lib/barrel.ts"]="export type {Row as Renamed} from './ambiguous';";
  error.clear();
  assert(!zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(!error.empty());
  files["/virtual/lib/barrel.ts"]="import type { Row as Hidden } from './types'; export type {Hidden as Renamed};";
  files["/virtual/lib/types.ts"]="export class Row { value:number=1; }";
  error.clear();
  assert(zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.empty() && out.find("__dynAs('")==std::string::npos);
  files["/virtual/lib/types.ts"]="export interface Row {next:Deep0;}";
  for(int i=0;i<20;++i) files["/virtual/lib/types.ts"] += "interface Deep"+std::to_string(i)+" {value:"+(i==19?std::string("number"):"Deep"+std::to_string(i+1))+";}";
  error.clear();
  assert(!zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.find("depth")!=std::string::npos);
  files["/virtual/std/.hidden.ts"]="export interface Renamed {id:string;}";
  types.resolve=[](const std::string&,const std::string&) { return std::string("/virtual/std/.hidden.ts"); };
  error.clear();
  assert(zn::qjs::toJavaScript(source,"zinc:standard-root",out,error,true,&types));
  assert(error.empty() && out.find("id:s")!=std::string::npos);
  std::cout << "checked transform: pass\n";
}
