#include "assets/scene_world.h"
#include "assets/model.h"
#include "assets/world.h"
#include "zn/zworld.h"
extern "C" {
#include "sha256.h"
}
#include "yyjson.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <memory>
#include <set>

namespace zn::assets {
namespace {
using J=yyjson_val;
using M=yyjson_mut_val;
using Mat=std::array<double,16>;
std::string text(J* value){const char* s=yyjson_get_str(value);return s?s:"";}
J* field(J* value,const char* key){return yyjson_obj_get(value,key);}
std::string word(J* value,const char* key){return text(field(value,key));}
bool relative(const std::string& value){
  if(value.empty()||value[0]=='/'||value.back()=='/'||value.find("//")!=std::string::npos||value.find_first_of("\\:")!=std::string::npos||value.find('\0')!=std::string::npos)return false;
  const std::filesystem::path path(value);
  return path.lexically_normal().generic_string()==value&&std::none_of(path.begin(),path.end(),[](const auto& p){return p=="..";});
}
bool numbers(J* value,int n,double* out){
  if(!yyjson_is_arr(value)||yyjson_arr_size(value)!=std::size_t(n))return false;
  for(int i=0;i<n;i++){J* v=yyjson_arr_get(value,i);if(!yyjson_is_num(v)||!std::isfinite(out[i]=yyjson_get_num(v)))return false;}
  return true;
}
bool source(J* value){return yyjson_is_obj(value)&&relative(word(value,"file"))&&!word(value,"object").empty();}
bool hash(const std::string& value){return value.size()==64&&value.find_first_not_of("0123456789abcdef")==std::string::npos;}
std::string sha(const std::string& bytes){
  SHA256_CTX c;sha256_init(&c);sha256_update(&c,reinterpret_cast<const BYTE*>(bytes.data()),bytes.size());BYTE out[SHA256_BLOCK_SIZE];sha256_final(&c,out);
  std::string s;for(BYTE b:out){s+="0123456789abcdef"[b>>4];s+="0123456789abcdef"[b&15];}return s;
}
Mat multiply(const Mat& a,const Mat& b){Mat o{};for(int c=0;c<4;c++)for(int r=0;r<4;r++)for(int k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
Mat compose(const double* p,const double* q,const double* s){
  const double x=q[0],y=q[1],z=q[2],w=q[3];
  return {(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,
          2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,
          2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,p[0],p[1],p[2],1};
}
double determinant(const Mat& m){return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);}
bool decompose(const Mat& m,double* p,double* q,double* s){
  Mat r=m;for(int c=0;c<3;c++){s[c]=std::sqrt(m[c*4]*m[c*4]+m[c*4+1]*m[c*4+1]+m[c*4+2]*m[c*4+2]);if(!(s[c]>1e-12))return false;}
  if(determinant(m)<0)s[0]=-s[0];
  for(int c=0;c<3;c++)for(int row=0;row<3;row++)r[c*4+row]/=s[c];
  for(int a=0;a<3;a++)for(int b=a+1;b<3;b++)if(std::abs(r[a*4]*r[b*4]+r[a*4+1]*r[b*4+1]+r[a*4+2]*r[b*4+2])>1e-5)return false;
  const double trace=r[0]+r[5]+r[10];
  if(trace>0){const double t=std::sqrt(trace+1)*2;q[3]=t/4;q[0]=(r[6]-r[9])/t;q[1]=(r[8]-r[2])/t;q[2]=(r[1]-r[4])/t;}
  else if(r[0]>r[5]&&r[0]>r[10]){const double t=std::sqrt(1+r[0]-r[5]-r[10])*2;q[3]=(r[6]-r[9])/t;q[0]=t/4;q[1]=(r[4]+r[1])/t;q[2]=(r[8]+r[2])/t;}
  else if(r[5]>r[10]){const double t=std::sqrt(1+r[5]-r[0]-r[10])*2;q[3]=(r[8]-r[2])/t;q[0]=(r[4]+r[1])/t;q[1]=t/4;q[2]=(r[9]+r[6])/t;}
  else {const double t=std::sqrt(1+r[10]-r[0]-r[5])*2;q[3]=(r[1]-r[4])/t;q[0]=(r[8]+r[2])/t;q[1]=(r[9]+r[6])/t;q[2]=t/4;}
  for(int i=0;i<3;i++)p[i]=m[12+i];return true;
}
M* array(yyjson_mut_doc* d,const double* values,int n){M* a=yyjson_mut_arr(d);for(int i=0;i<n;i++)yyjson_mut_arr_add_real(d,a,values[i]);return a;}
void string(yyjson_mut_doc* d,M* o,const char* key,const std::string& value){yyjson_mut_obj_add_strcpy(d,o,key,value.c_str());}
struct Asset{J* json=nullptr;std::string uri,digest,kind;std::vector<std::string> dependencies;};
struct Node{J* json=nullptr;std::string id,parent,asset,world;Mat local{},global{};bool dynamic=false,explicitDynamic=false,behavior=false,marker=false,removed=false;int state=0;};
struct Group{double cell=0;std::vector<std::string> levels{"near","mid","far"};};
class Import {
 public:
  std::string error,name;
  std::unique_ptr<yyjson_doc,decltype(&yyjson_doc_free)> doc{nullptr,yyjson_doc_free};
  std::map<std::string,Asset> assets;std::map<std::string,Node> nodes;std::map<std::string,Group> groups;
  bool fail(const std::string& why){error=why;return false;}
  bool graphs(){
    std::map<std::string,size_t> waiting;
    std::map<std::string,std::vector<std::string>> dependants;
    std::vector<std::string> ready;
    for(const auto& [id,a]:assets){
      waiting[id]=a.dependencies.size();
      for(const auto& dep:a.dependencies){if(!assets.count(dep))return fail("missing asset reference "+dep);dependants[dep].push_back(id);}
      if(a.dependencies.empty())ready.push_back(id);
    }
    for(size_t cursor=0;cursor<ready.size();cursor++)for(const auto& id:dependants[ready[cursor]])if(--waiting[id]==0)ready.push_back(id);
    if(ready.size()!=assets.size())for(const auto& [id,count]:waiting)if(count)return fail("asset dependency cycle at "+id);
    ready.clear();std::map<std::string,std::vector<std::string>> children;
    for(const auto& [id,n]:nodes){
      if(n.parent.empty())ready.push_back(id);
      else {if(!nodes.count(n.parent))return fail("missing parent reference "+n.parent);children[n.parent].push_back(id);}
    }
    for(size_t cursor=0;cursor<ready.size();cursor++){
      Node& n=nodes.at(ready[cursor]);n.global=n.local;n.dynamic=n.explicitDynamic||n.behavior;
      if(!n.parent.empty()){const Node& parent=nodes.at(n.parent);n.global=multiply(parent.global,n.local);n.dynamic=n.dynamic||parent.dynamic;n.world=parent.world;}
      if(n.marker){if(n.dynamic)return fail(n.id+": world marker cannot be inside a dynamic/behavior subtree");n.world=n.id;}
      for(double v:n.global)if(!std::isfinite(v))return fail(n.id+": world transform overflow");
      n.removed=!n.world.empty()&&!n.dynamic&&!n.marker;n.state=2;
      for(const auto& child:children[n.id])ready.push_back(child);
    }
    if(ready.size()!=nodes.size())for(const auto& [id,n]:nodes)if(n.state!=2)return fail("node cycle at "+id);
    return true;
  }
  bool parse(const std::string& file,const std::string& json){
    name=file;doc.reset(yyjson_read(json.data(),json.size(),0));J* root=doc?yyjson_doc_get_root(doc.get()):nullptr;
    if(!yyjson_is_obj(root)||word(root,"schema")!="zinc.scene"||yyjson_get_int(field(root,"version"))!=1)return fail("expected zinc.scene version 1");
    if(field(root,"compiled"))return fail("scene is already compiled; build its original authoring publication");
    if(word(root,"id").empty()||!hash(word(root,"revision")))return fail("scene identity/revision missing");
    J* origin=field(root,"source");if(!relative(word(origin,"file"))||word(origin,"tool").empty()||word(origin,"scene").empty())return fail("scene source provenance missing");
    J* aa=field(root,"assets"),*nn=field(root,"nodes");if(!yyjson_is_arr(aa)||!yyjson_is_arr(nn)||yyjson_arr_size(nn)>100000)return fail("assets/nodes must be arrays (100000-node maximum)");
    size_t i,max;J* item;
    yyjson_arr_foreach(aa,i,max,item){
      const std::string id=word(item,"id"),uri=word(item,"uri"),digest=word(item,"hash"),kind=field(item,"kind")?word(item,"kind"):"model";
      if(id.empty()||assets.count(id))return fail("missing/duplicate asset identity "+id);
      if(!relative(uri)||!hash(digest)||(kind!="model"&&kind!="skin"))return fail(id+": invalid asset URI/hash/kind");
      Asset a;a.json=item;a.uri=uri;a.digest=digest;a.kind=kind;J* deps=field(item,"dependencies");if(!yyjson_is_arr(deps))return fail(id+": dependencies must be an array");
      size_t j,count;J* dep;yyjson_arr_foreach(deps,j,count,dep){if(!yyjson_is_str(dep)||text(dep).empty())return fail(id+": invalid dependency");if(std::find(a.dependencies.begin(),a.dependencies.end(),text(dep))!=a.dependencies.end())return fail(id+": duplicate dependency");a.dependencies.push_back(text(dep));}assets.emplace(id,std::move(a));
    }
    yyjson_arr_foreach(nn,i,max,item){
      if(!source(field(item,"source")))return fail("node source provenance missing");
      Node n;n.json=item;n.id=word(item,"id");n.parent=word(item,"parent");n.asset=word(item,"asset");
      if(n.id.empty()||nodes.count(n.id))return fail("missing/duplicate node identity "+n.id);
      if(!source(field(item,"source"))||word(item,"name").empty())return fail(n.id+": missing source/name");
      for(const char* key:{"parent","asset"})if((!yyjson_is_null(field(item,key))&&!yyjson_is_str(field(item,key)))||(yyjson_is_str(field(item,key))&&word(item,key).empty()))return fail(n.id+": parent/asset must be identity or null");
      if(!n.asset.empty()&&!assets.count(n.asset))return fail(n.id+": missing asset reference "+n.asset);
      double p[3],q[4],s[3];if(!numbers(field(item,"translation"),3,p)||!numbers(field(item,"rotation"),4,q)||!numbers(field(item,"scale"),3,s))return fail(n.id+": invalid TRS");
      double norm=0;for(double v:q)norm+=v*v;if(std::abs(norm-1)>.001)return fail(n.id+": quaternion must be normalized");for(double v:s)if(std::abs(v)<1e-9)return fail(n.id+": zero scale");n.local=compose(p,q,s);
      J* dynamic=field(item,"dynamic");if(dynamic&&!yyjson_is_bool(dynamic))return fail(n.id+": dynamic must be boolean");n.explicitDynamic=yyjson_get_bool(dynamic);
      if(!n.asset.empty()&&assets.at(n.asset).kind=="skin"&&!n.explicitDynamic)return fail(n.id+": skin must be dynamic");
      J* metadata=field(item,"metadata");if(!yyjson_is_obj(metadata))return fail(n.id+": typed metadata missing");
      size_t j,count;J* key,*value;yyjson_obj_foreach(metadata,j,count,key,value){
        const std::string kind=text(key);if(!yyjson_is_obj(value))return fail(n.id+": metadata component must be object");
        if(kind=="world"){
          J* cell=field(value,"cell");if(!yyjson_is_num(cell)||!std::isfinite(yyjson_get_num(cell))||yyjson_get_num(cell)<=0)return fail(n.id+": world.cell must be positive finite metres");
          Group group;group.cell=yyjson_get_num(cell);J* levels=field(value,"levels");
          if(levels){
            if(!yyjson_is_arr(levels)||!yyjson_arr_size(levels)||yyjson_arr_size(levels)>3)return fail(n.id+": world.levels must be an included-level name list");
            group.levels.clear();size_t k,total;J* level;
            yyjson_arr_foreach(levels,k,total,level){const auto name=text(level);if((name!="near"&&name!="mid"&&name!="far")||std::find(group.levels.begin(),group.levels.end(),name)!=group.levels.end())return fail(n.id+": world.levels must contain unique near/mid/far names");group.levels.push_back(name);}
          }
          groups[n.id]=group;n.marker=true;
        }else if(kind=="collision"||kind=="trigger"){
          double size[3];if(word(value,"shape")!="box"||!numbers(field(value,"size"),3,size)||std::any_of(size,size+3,[](double v){return v<=0;}))return fail(n.id+": invalid box metadata");
          if(kind=="trigger"){if(word(value,"event").empty())return fail(n.id+": trigger event missing");n.behavior=true;}
        }else if(kind=="camera"){
          const double fov=yyjson_get_num(field(value,"fov")),near=yyjson_get_num(field(value,"near")),far=yyjson_get_num(field(value,"far"));
          if(!std::isfinite(fov)||!std::isfinite(near)||!std::isfinite(far)||!(fov>0&&fov<180&&near>0&&far>near))return fail(n.id+": invalid camera");n.behavior=true;
        }else if(kind=="socket"||kind=="spawn"||kind=="gate"||kind=="interaction"){
          if(word(value,kind=="interaction"?"event":"name").empty())return fail(n.id+": metadata identity missing");n.behavior=true;
        }else return fail(n.id+": unsupported metadata "+kind);
      }
      nodes.emplace(n.id,std::move(n));
    }
    return graphs();
  }
  bool build(const ToolPath& basisu,const std::map<std::string,std::string>& side,const std::map<std::string,std::string>& options,std::string& out);
};
} // namespace
namespace {
std::string json(yyjson_mut_doc* d){size_t size=0;char* p=yyjson_mut_write(d,0,&size);std::string out(p?p:"",size);free(p);return out;}
std::uint32_t get32(const std::string& s,size_t p){return std::uint32_t(static_cast<unsigned char>(s[p]))|std::uint32_t(static_cast<unsigned char>(s[p+1]))<<8|std::uint32_t(static_cast<unsigned char>(s[p+2]))<<16|std::uint32_t(static_cast<unsigned char>(s[p+3]))<<24;}
bool Import::build(const ToolPath& basisu,const std::map<std::string,std::string>& side,const std::map<std::string,std::string>& options,std::string& out){
  auto cooked=std::unique_ptr<yyjson_mut_doc,decltype(&yyjson_mut_doc_free)>(yyjson_doc_mut_copy(doc.get(),nullptr),yyjson_mut_doc_free);
  auto* d=cooked.get();M* root=yyjson_mut_doc_get_root(d),*kept=yyjson_mut_arr(d),*aa=yyjson_mut_arr(d),*worlds=yyjson_mut_arr(d),*sources=yyjson_mut_arr(d);
  const auto dir=std::filesystem::path(name).parent_path();
  std::set<std::string> used;
  for(const auto& [id,n]:nodes)if(!n.removed&&!n.asset.empty())used.insert(n.asset);
  std::vector<std::string> pending(used.begin(),used.end());for(size_t i=0;i<pending.size();i++)for(const auto& dep:assets.at(pending[i]).dependencies)if(used.insert(dep).second)pending.push_back(dep);
  for(const auto& id:used)yyjson_mut_arr_append(aa,yyjson_val_mut_copy(d,assets.at(id).json));
  for(const auto& [id,n]:nodes){
    if(n.removed)continue;
    M* copy=yyjson_val_mut_copy(d,n.json);
    if(!n.parent.empty()&&nodes.at(n.parent).removed){
      double p[3],q[4],s[3];if(!decompose(n.global,p,q,s))return fail(id+": retained descendant has shear; move it outside the fused subtree");
      yyjson_mut_obj_remove_str(copy,"parent");yyjson_mut_obj_add_null(d,copy,"parent");
      for(const char* key:{"translation","rotation","scale"})yyjson_mut_obj_remove_str(copy,key);
      yyjson_mut_obj_add_val(d,copy,"translation",array(d,p,3));yyjson_mut_obj_add_val(d,copy,"rotation",array(d,q,4));yyjson_mut_obj_add_val(d,copy,"scale",array(d,s,3));
    }
    yyjson_mut_arr_append(kept,copy);
  }
  std::vector<BundleEntry> entries;
  for(const auto& [id,g]:groups){
    auto manifest=std::unique_ptr<yyjson_mut_doc,decltype(&yyjson_mut_doc_free)>(yyjson_mut_doc_new(nullptr),yyjson_mut_doc_free);
    auto* md=manifest.get();M* mr=yyjson_mut_obj(md),*refs=yyjson_mut_arr(md);yyjson_mut_doc_set_root(md,mr);yyjson_mut_obj_add_val(md,mr,"scenes",refs);
    for(const auto& [nid,n]:nodes)if(n.removed&&n.world==id&&!n.asset.empty()){
      const auto& asset=assets.at(n.asset);const std::string file=(dir/asset.uri).generic_string();auto it=side.find(file);
      if(it==side.end()||sha(it->second)!=asset.digest)return fail(nid+": source asset hash mismatch");
      M* ref=yyjson_mut_obj(md);string(md,ref,"file",asset.uri);string(md,ref,"id",nid);yyjson_mut_obj_add_val(md,ref,"matrix",array(md,n.global.data(),16));yyjson_mut_arr_append(refs,ref);
    }
    if(!yyjson_mut_arr_size(refs))return fail(id+": world contains no static geometry");
    auto opts=options;opts["cell"]=std::to_string(g.cell);std::string levels;for(const auto& level:g.levels){if(!levels.empty())levels+=",";levels+=level;}opts["levels"]=levels;
    std::string recipe=json(md)+word(yyjson_doc_get_root(doc.get()),"revision");for(const auto& [key,value]:opts)recipe+=key+"="+value+"\n";for(const auto& [file,data]:side)recipe+=file+sha(data);
    const std::string stem="world-"+sha(recipe).substr(0,24),generated=(dir/(stem+".world.json")).generic_string();
    std::string packed;if(!importWorld(basisu,generated,json(md),side,opts,packed,error))return false;
    std::vector<BundleEntry> built;if(!splitBundle(packed,built))return fail("damaged world importer bundle");
    M* record=yyjson_mut_obj(d),*chunks=yyjson_mut_arr(d),*levelNames=yyjson_mut_arr(d);string(d,record,"id",id);yyjson_mut_obj_add_real(d,record,"cell",g.cell);for(const auto& level:g.levels)yyjson_mut_arr_add_strcpy(d,levelNames,level.c_str());yyjson_mut_obj_add_val(d,record,"levels",levelNames);yyjson_mut_obj_add_val(d,record,"chunks",chunks);
    std::map<std::string,std::string> files;for(const auto& entry:built)files[entry.name]=entry.data;
    const auto indexName=(dir/(stem+".zworld")).generic_string();const auto& index=files.at(indexName);string(d,record,"uri",stem+".zworld");string(d,record,"hash",sha(index));const auto cells=get32(index,8),count=get32(index,12);yyjson_mut_obj_add_uint(d,record,"cells",cells);
    size_t offset=16+size_t(cells)*44;for(std::uint32_t i=0;i<count;i++){
      const auto level=get32(index,offset),length=get32(index,offset+4);offset+=8;const auto file=index.substr(offset,length);offset=(offset+length+3)&~size_t(3);
      M* chunk=yyjson_mut_obj(d);string(d,chunk,"uri",file);string(d,chunk,"hash",sha(files.at((dir/file).generic_string())));yyjson_mut_obj_add_uint(d,chunk,"level",level);yyjson_mut_arr_append(chunks,chunk);
    }
    const auto provenanceName=(dir/(stem+".zworld.json")).generic_string();const auto& provenance=files.at(provenanceName);
    auto pd=std::unique_ptr<yyjson_doc,decltype(&yyjson_doc_free)>(yyjson_read(provenance.data(),provenance.size(),0),yyjson_doc_free);
    M* enriched=yyjson_val_mut_copy(d,yyjson_doc_get_root(pd.get()));M* logical=yyjson_mut_arr(d);
    for(const auto& [nid,n]:nodes)if(n.removed&&n.world==id){M* row=yyjson_val_mut_copy(d,n.json);yyjson_mut_obj_add_val(d,row,"matrix",array(d,n.global.data(),16));yyjson_mut_arr_append(logical,row);}
    yyjson_mut_obj_add_val(d,enriched,"logicalNodes",logical);
    yyjson_mut_obj_add_val(d,enriched,"sourceAssets",yyjson_val_mut_copy(d,field(yyjson_doc_get_root(doc.get()),"assets")));
    size_t provenanceSize=0;char* provenanceBytes=yyjson_mut_val_write(enriched,0,&provenanceSize);
    for(auto& entry:built)if(entry.name==provenanceName)entry.data.assign(provenanceBytes,provenanceSize);free(provenanceBytes);
    // Keep importer-authoritative cell/level/chunk/batch tuples alongside the original authored identities.
    yyjson_mut_obj_add_val(d,record,"provenance",enriched);yyjson_mut_arr_append(worlds,record);
    M* mapping=yyjson_mut_obj(d);string(d,mapping,"world",id);string(d,mapping,"uri",stem+".zworld.json");yyjson_mut_arr_append(sources,mapping);
    for(auto& entry:built)entries.push_back(std::move(entry));
  }
  yyjson_mut_obj_remove_str(root,"nodes");yyjson_mut_obj_add_val(d,root,"nodes",kept);yyjson_mut_obj_remove_str(root,"assets");yyjson_mut_obj_add_val(d,root,"assets",aa);
  yyjson_mut_obj_remove_str(root,"worldSources");yyjson_mut_obj_add_val(d,root,"worldSources",sources);yyjson_mut_obj_add_val(d,root,"worlds",worlds);string(d,root,"compiled","zworld-v1");
  entries.insert(entries.begin(),BundleEntry{std::filesystem::path(name).replace_extension("runtime.json").generic_string(),0,0,0,json(d)});out=bundleOf(entries);return true;
}
} // namespace
bool hasSceneWorld(const std::string& value){auto d=std::unique_ptr<yyjson_doc,decltype(&yyjson_doc_free)>(yyjson_read(value.data(),value.size(),0),yyjson_doc_free);if(!d)return false;J* root=yyjson_doc_get_root(d.get());if(word(root,"schema")!="zinc.scene")return false;size_t i,max;J* node;yyjson_arr_foreach(field(root,"nodes"),i,max,node)if(field(field(node,"metadata"),"world"))return true;return false;}
bool sceneWorldDeps(const std::string& name,const std::string& value,std::vector<std::string>& deps,std::vector<std::string>& consumed,std::vector<std::string>& retained,std::string& error){
  Import loader;if(!loader.parse(name,value)){error=loader.error;return false;}const auto dir=std::filesystem::path(name).parent_path();std::set<std::string> needed;
  for(const auto& [id,n]:loader.nodes)if(!n.removed&&!n.asset.empty())needed.insert(n.asset);
  std::vector<std::string> todo(needed.begin(),needed.end());for(size_t i=0;i<todo.size();i++)for(const auto& dep:loader.assets.at(todo[i]).dependencies)if(needed.insert(dep).second)todo.push_back(dep);
  for(const auto& [id,a]:loader.assets){auto file=(dir/a.uri).generic_string();deps.push_back(file);(needed.count(id)?retained:consumed).push_back(file);}return true;
}
bool importSceneWorld(const ToolPath& basisu,const std::string& name,const std::string& value,const std::map<std::string,std::string>& side,const std::map<std::string,std::string>& options,std::string& out,std::string& error){Import loader;if(!loader.parse(name,value)||!loader.build(basisu,side,options,out)){error=loader.error;return false;}return true;}
} // namespace zn::assets
