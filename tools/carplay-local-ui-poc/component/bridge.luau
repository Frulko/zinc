-- Offline CP recorder for one selected component, not a general CP implementation.
-- Original modules are supplied by the caller and remain unchanged. Unsupported
-- native services fail instead of silently pretending to render or transmit data.
-- Layer defaults and coordinate conventions still need a reference-renderer check.
local hostPrint=print
local now=0
local tasks={}
local layers={}
local loaded={}
local modules={}
local CP={version='1.4.0',INVALIDVALUE={}}
local function require(name)
 local key=name:gsub('%.','/')
 if loaded[key] then return loaded[key] end
 assert(modules[key], 'Missing module '..key)
 loaded[key]=modules[key]()
 return loaded[key]
end
local function enum(names)
 local t={};for i,n in ipairs(names) do t[n]=i-1 end;return t
end
CP.LOGLEVELS=enum({'TRACE','DEBUG','INFO','WARNING','ERROR','NONE'})
CP.getLogLevel=function() return 3 end
CP.setLogLevel=function() end
CP.log=function(...) hostPrint('LOG',...) end
CP.getSystemUpTime=function() return now end
CP.enumerateOutputStreams=function() return {{identifier='Cluster_Display',frameDuration=1/60,width=1920,height=720}} end
CP.loadPersistentStorage=function() return '{}' end
CP.savePersistentStorage=function() end
CP.createAssetRAW=function(name) if name=='config.json' then return '{}' end; error('RAW unavailable '..name) end
CP.DPPoint=function(x,y) return {x=x,y=y} end
local function rect(x,y,w,h) return setmetatable({origin={x=x,y=y},size={width=w,height=h}},{__index={applyTransform=function(r,t) return t:applyToRect(r) end}}) end
CP.DPRect=setmetatable({withSize=function(size) return rect(0,0,size.width,size.height) end},{__call=function(_,...) return rect(...) end})
CP.DPColor=function(r,g,b,a) return {r=r,g=g,b=b,a=a} end
local transformMethods={}
local function transform(a,b,c,d,tx,ty) return setmetatable({a=a,b=b,c=c,d=d,tx=tx,ty=ty},{__index=transformMethods}) end
function transformMethods:multiply(o)
 return transform(self.a*o.a+self.c*o.b,self.b*o.a+self.d*o.b,self.a*o.c+self.c*o.d,self.b*o.c+self.d*o.d,self.a*o.tx+self.c*o.ty+self.tx,self.b*o.tx+self.d*o.ty+self.ty)
end
function transformMethods:add(x,y) return self:multiply(transform(1,0,0,1,x,y)) end
function transformMethods:applyToPoint(p) return CP.DPPoint(self.a*p.x+self.c*p.y+self.tx,self.b*p.x+self.d*p.y+self.ty) end
function transformMethods:applyToRect(r)
 local p=self:applyToPoint(r.origin);return rect(p.x,p.y,r.size.width*self.a,r.size.height*self.d)
end
CP.DPAffineTransform=setmetatable({translate=function(x,y) return transform(1,0,0,1,x,y) end,scale=function(x,y) return transform(x,0,0,y,0,0) end,rotate=function(a) return transform(math.cos(a),math.sin(a),-math.sin(a),math.cos(a),0,0) end},{__call=function(_,...) return transform(...) end})
local pathMethods={}
for _,name in ipairs({'moveTo','lineTo','quadTo','cubeTo','arcTo','closeSubpath','ellipseInRect'}) do
 pathMethods[name]=function(self,...) table.insert(self.commands,{op=name,args={...}});self.numPoints+=1 end
end
CP.DPPath={create=function() return setmetatable({commands={},numPoints=0},{__index=pathMethods}) end}
local layerMethods={}
local function newLayer(kind)
 local p={name="",kind=kind,id=#layers+1,children={},frame=rect(0,0,0,0),bounds=rect(0,0,0,0),position=CP.DPPoint(0,0),anchorPoint=CP.DPPoint(.5,.5),opacity=1,hidden=false,transform=transform(1,0,0,1,0,0),backgroundColor=CP.DPColor(0,0,0,0),tint=CP.DPColor(1,1,1,1),strokeColor=CP.DPColor(0,0,0,0),fillColor=CP.DPColor(0,0,0,0),lineWidth=1,strokeStart=0,strokeEnd=1}
 local l=setmetatable({_p=p},{__index=function(_,k) return layerMethods[k] or p[k] end,__newindex=function(_,k,v)
  p[k]=v
  if k=='frame' then p.bounds=rect(0,0,v.size.width,v.size.height);p.position=CP.DPPoint(v.origin.x+p.anchorPoint.x*v.size.width,v.origin.y+p.anchorPoint.y*v.size.height)
  elseif k=='bounds' or k=='position' then p.frame=rect(p.position.x-p.anchorPoint.x*p.bounds.size.width,p.position.y-p.anchorPoint.y*p.bounds.size.height,p.bounds.size.width,p.bounds.size.height) end
 end})
 table.insert(layers,l);return l
end
function layerMethods:setStops(stops) self.stops=stops end
function layerMethods:getSublayers() return self.children end
function layerMethods:addSublayer(l) l:removeFromSuperlayer();table.insert(self.children,l);l.parent=self end
function layerMethods:removeFromSuperlayer() if self.parent then self.parent:removeSublayer(self) end end
function layerMethods:removeSublayer(l) for i,c in ipairs(self.children) do if c==l then table.remove(self.children,i);l.parent=nil;return end end end
function layerMethods:removeSublayers() for _,c in ipairs(self.children) do c.parent=nil end;self.children={} end
function layerMethods:insertSublayerAtIndex(l,i) l:removeFromSuperlayer();table.insert(self.children,i+1,l);l.parent=self end
function layerMethods:setMask(l) self.mask=l end
function layerMethods:addFilter(f) error('Filter not implemented') end
function layerMethods:getTransformTo(other)
 local function world(l)
  local t=transform(1,0,0,1,0,0)
  while l do local f=l.frame;t=transform(1,0,0,1,f.origin.x,f.origin.y):multiply(l.transform):multiply(t);l=l.parent end
  return t
 end
 local a,b=world(self),world(other)
 assert(b.a==1 and b.b==0 and b.c==0 and b.d==1,'Nontranslation target transform')
 a.tx-=b.tx;a.ty-=b.ty;return a
end
CP.DPLayer={create=function() return newLayer('layer') end,BLEND=enum({'COPY','CLEAR','SOURCEOVER','SOURCEIN','SOURCEOUT','SOURCEATOP','DESTOVER','DESTIN','DESTOUT','DESTATOP','ADDITIVE','PLUSLIGHTER','EXCLUSIVEOR','XOR','SCREEN','EXCLUSION','MAXIMUM','MINIMUM','SUBTRACTSRC','SUBTRACTDEST','COMPONENTMASK','NORMAL'}),CURVE=enum({'CIRCULAR','CONTINUOUS'})}
CP.DPShapeLayer={create=function() return newLayer('shape') end,FILLRULE=enum({'EVENODD','NONZERO'}),LINECAP=enum({'BUTT','ROUND','SQUARE'}),LINEJOIN=enum({'MITER','ROUND','BEVEL'})}
CP.DPImageLayer={create=function() return newLayer('image') end,fromLayerTree=function() error('Snapshot not implemented') end}
CP.DPGradientLayer={create=function() return newLayer('gradient') end,KIND=enum({'LINEAR','RADIAL','CONICAL'})}
CP.DPGradientStop=function(color,position) return {position=position,color=color} end
CP.DPVideoLayer={STREAMSTATE=enum({'CLOSED','SUBSCRIBED','DATAAVAILABLE','UNSUBSCRIBED','INVALID'}),create=function() error('Video outside gauge probe') end}
CP.DPBackdropLayer={create=function() error('Backdrop outside gauge probe') end}
CP.DPBlurFilter={create=function() error('Blur outside gauge probe') end}
CP.DPLuaTask={create=function()
 local task={};tasks[#tasks+1]=task
 function task:run(f) self.co=coroutine.create(f) end
 function task:stop() self.co=nil end
 function task:isBusy() return self.co~=nil and coroutine.status(self.co)~='dead' end
 return task
end}
local function advance(seconds)
 for i=1,math.ceil(seconds*60) do now+=1/60;if loaded["APL/flux"] then loaded["APL/flux"].update(1/60) end;for _,task in ipairs(tasks) do if task.co and coroutine.status(task.co)~='dead' then local ok,err=coroutine.resume(task.co);assert(ok,err) end end end
end
CP.DPTexture={createFromImage=function(asset) return {path=asset.path,width=asset.width,height=asset.height} end}
CP.createAssetImage=function(path)
 local m=imageMetadata[path];assert(m,'Missing image '..path)
 return {path=path,width=m[1],height=m[2],getSize=function() return m[1],m[2] end,getData=function() return path,0 end}
end
setmetatable(CP,{__index=function(_,key) error('Unsupported CP call: '..key) end})
