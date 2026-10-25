#pragma once
// zinc.scene -> the existing ZWD1/ZWC1 format (include/zn/zworld.h), inside the asset cache/bundle pipeline.
#include <map>
#include <string>
#include <vector>
#include "assets/texture.h"
namespace zn::assets {
bool hasSceneWorld(const std::string& json);
bool sceneWorldDeps(const std::string& name,const std::string& json,std::vector<std::string>& dependencies,
                    std::vector<std::string>& consumed,std::vector<std::string>& retained,std::string& error);
bool importSceneWorld(const ToolPath& basisu,const std::string& name,const std::string& json,const std::map<std::string,std::string>& side,
                      const std::map<std::string,std::string>& options,std::string& bundle,std::string& error);
}
