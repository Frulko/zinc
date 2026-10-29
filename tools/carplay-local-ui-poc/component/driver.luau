-- Exercise original constructors/controllers with explicitly simulated inputs.
-- Unit IDs belong to this package; these are not live Vehicle State wire values.
local APL=require('APL.APL')
APL.Asset.setManifest('AssetManifestData','r/Cluster_Display')
local package=require('r/PackageData')
local packageParser=require('PackageParser').new(package)
local raw=package.displays[1].layouts[1]
-- Select one original component without editing its slots or appearance.
local zone=table.clone(raw.zones[1]);zone.components={zone.components[1]}
local info=packageParser:_parseLayout({id=raw.id,displayName=raw.displayName,layoutType=raw.layoutType,layoutStyleID=raw.layoutStyleID,zones={zone}})
local Theme=require('Theme')
local theme=Theme.fromJson(require('r/ThemeData'))
local appearance=require('AppearanceController').State.new(info:getPalette(theme),1)
local state={fuelPortSideIndicator=0,remainingDistance={[151]=320,[164]=199},lengthUnit=151,remainingRangeHidden=false,fuelLevelMarkerLow=.1,vehicleSpeed={[1032]=65,[1033]=40,[1034]=65000},vehicleSpeedUnit=1032,vehicleSpeedMax={[1032]=160,[1033]=100},uiSceneState={state=2},showSecondarySpeed=false,cruiseControlState=0,cruiseControlSpeed={[1032]=0,[1033]=0,[1034]=0},speedLimited=false,fuelLevel=.68,fuelLevelState=0,remainingRange=320,remainingRangeUnit=151,transmissionState={mode=0},driveMode=0}
local updater={subscriptions={}}
function updater:isSubscribable(...) local missing={};for _,id in pairs({...}) do if state[id]==nil then missing[#missing+1]=id end end; if #missing>0 then hostPrint('UNSUPPORTED_DATA',table.concat(missing,',')) end;return #missing==0,missing end
function updater:subscribe(ids,callback,...)
 local valid={};for _,id in ipairs(ids) do if state[id]~=nil then valid[#valid+1]=id end end
 if #valid~=#ids then hostPrint('MISSING_DATA',table.concat(ids,','));return valid,nil end
 local s={callback=callback,ids=ids};table.insert(self.subscriptions,s);callback(self:getData(ids),{});return valid,s
end
function updater:unsubscribe(s) for i,v in ipairs(self.subscriptions) do if v==s then table.remove(self.subscriptions,i);break end end end
function updater:getData(ids) local r={};for _,id in ipairs(ids) do r[id]=state[id] end;return r end
function updater:setData(values)
 local previous=table.clone(state)
 for k,v in pairs(values) do state[k]=v end
 for _,s in ipairs(self.subscriptions) do
  local changed,old={},{}
  for _,id in ipairs(s.ids) do
   if values[id]~=nil then changed[id]=values[id] end
   old[id]=previous[id]
  end
  if next(changed) then s.callback(changed,old) end
 end
end
local Layout=require('Layout')
local layout=Layout.new(info,appearance,APL.Rect.new(0,0,1920,720),updater,{},{},{},{},0)
local root=APL.Layer.new():setFrame(0,0,1920,720)
layout:attach(root,true)
layout:setLayoutMode(Layout.MODE.DRIVE,false)

local function serialize(l)
 local p=l._p;local r={}
 for k,v in pairs(p) do
  if k=='children' then local arr={};for _,c in ipairs(v) do arr[#arr+1]=serialize(c) end;r.children=arr
  elseif k=='mask' then r.mask=serialize(v)
  elseif k~='parent' and type(v)~='function' then r[k]=v end
 end
 return r
end
for _,speed in ipairs({0,65,130}) do
 updater:setData({vehicleSpeed={[1032]=speed,[1033]=math.floor(speed/1.609344),[1034]=speed*1000}})
 for i=1,120 do coroutine.yield() end
 hostPrint('SCENE_JSON:'..require('APL.json').encode({speed=speed,scene=serialize(root:getNativeLayer())}))
end
hostPrint('LAYER_COUNT',#layers)
