-- Runs selected original theme modules in an environment without IO/native loading.
-- This is a geometry/behavior probe, not an implementation of Apple's CP renderer.
local root = assert(arg[1])
local safe = {assert=assert, error=error, ipairs=ipairs, pairs=pairs, next=next,
    type=type, tostring=tostring, tonumber=tonumber, select=select,
    math=math, string=string, table=table, setmetatable=setmetatable, rawget=rawget}
local cache = {}
local allowed = {['r/PackageData']=true, ['r/ThemeData']=true,
    ['r/Cluster_Display/AssetManifestData']=true, ['APL/json']=true,
    ['APL/MathUtils']=true, AngleConfiguration=true, DigiBarRadialStyle=true,
    DigiBarRadialLayout=true, Units=true, UnitUtils=true, SpeedometerUtils=true}
local utils = {}
utils.readOnly = function(t) return t end
utils.makeObject = function(t) return t end
utils.newObject = function(class, fields) return setmetatable(fields, {__index=class}) end
utils.namedObject = function(name, ...)
    local fields, class = {...}, {_type=name}
    class.new = function(...)
        local values, result = {...}, {}
        for i, field in ipairs(fields) do result[type(field)=='table' and field[1] or field]=values[i] end
        return setmetatable(result, {__index=class})
    end
    return class
end
local apl = {LuaUtils=utils, GradientLayer={KIND={CONICAL=2}},
    Log={error=function() error('Original speed script reported invalid input') end}}
apl.Path = {new=function()
    return {arcTo=function(self,x,y,r,a,b,cw)
        self.arc={x=x,y=y,radius=r,startAngle=a,endAngle=b,clockwise=cw}
        return self
    end}
end}
cache['APL.APL'], cache['APL.LuaUtils'] = apl, utils
-- These dependencies are not used by _getNormalizedValue. Any unexpected use fails.
for _, name in ipairs({'Enums','Ticks','VehicleDataUpdater'}) do
    cache[name]=setmetatable({}, {__index=function() error('Unsupported dependency: '..name) end})
end
local function requireModule(name)
    if cache[name] then return cache[name] end
    local path = name:gsub('%.','/')
    assert(allowed[path], 'Module outside probe scope: '..name)
    cache[name]=assert(loadfile(root..'/'..path..'.lua','t',safe))()
    return cache[name]
end
safe.require = requireModule
-- Abort runaway script execution; the parent also enforces a wall-clock timeout.
debug.sethook(function() error('Lua instruction budget exceeded') end, '', 10000000)
apl.MathUtils=requireModule('APL.MathUtils')
local packageData=requireModule('r/PackageData')
local radial=requireModule('DigiBarRadialLayout')
local styleClass=requireModule('DigiBarRadialStyle')
local speed=requireModule('SpeedometerUtils')
local units=requireModule('Units').Speed
local display=packageData.displays[1]
assert(display.id=='Cluster_Display', 'Expected Cluster_Display first')
local layout=display.layouts[1]
local component=layout.zones[1].components[1]
assert(component.name=='Speedometer', 'Expected Speedometer first')
local styles={}
local function walk(t,path)
    if type(t)~='table' then return end
    if t.radial and t.radial.configuration then
        local c=t.radial.configuration
        if c.trackWidth and c.trackWidth>10 then styles[#styles+1]={path=path,configuration=c} end
    end
    local keys={}
    for k in pairs(t) do keys[#keys+1]=k end
    table.sort(keys,function(a,b) return tostring(a)<tostring(b) end)
    for _,k in ipairs(keys) do walk(t[k],path..'.'..tostring(k)) end
end
walk(component,'Speedometer')
assert(#styles>0,'No radial gauge style')
local chosen=styles[1]
local style=styleClass.fromJson(chosen.configuration)
local size=math.min(component.size[1],component.size[2])
local frame={centeredMinSquare=function(self) return self end,
    getBounds=function() return 0,0,size,size end}
local _,path,width,cap=radial.getBarLayout(style,frame,0,0)
path.arc.sweep=style.angleConfiguration:getNormalizedAngleForProgress(1)
    -style.angleConfiguration:getNormalizedAngleForProgress(0)
local maximum=chosen.configuration.angleConfiguration.bounds[2]
assert(maximum>0)
local samples={}
for _,kph in ipairs({0,65,130}) do
    local normalized=speed._getNormalizedValue({[units.METERS_PER_HOUR]=kph*1000},
        {[units.KILOMETERS_PER_HOUR]=maximum},units.KILOMETERS_PER_HOUR,true)
    assert(math.abs(normalized-math.min(kph/maximum,1))<1e-9)
    samples[#samples+1]={kph=kph,progress=normalized}
end
local manifest=requireModule('r/Cluster_Display/AssetManifestData')
local imageIds={}
local function images(t)
    if type(t)~='table' then return end
    if t.identifier and manifest[t.identifier] then imageIds[t.identifier]=manifest[t.identifier] end
    for _,v in pairs(t) do images(v) end
end
images(component)
local result={display=display.id,layout=layout.id,component=component.id,
    stylePath=chosen.path,size=size,maximum=maximum,arc=path.arc,width=width,cap=cap,
    samples=samples,images=imageIds,theme=requireModule('r/ThemeData')}
print(requireModule('APL/json').encode(result))
