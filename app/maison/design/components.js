const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);
await Promise.all(['Regular','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
const root=await figma.getNodeByIdAsync('4:2');const made=[],changed=[],contractKeys={};
const node=id=>figma.getNodeByIdAsync(id);
const sliderSet=await figma.importComponentSetByKeyAsync('32e5ee1981237f506e8eba45d8f4835bcbb4e6cb');
const switchSet=await figma.importComponentSetByKeyAsync('7a8dc511d7173ec44c06ef0e8b1a5a6947c4a19c');
const sliderMaster=figma.createComponent();sliderMaster.name='Maison / Native / Slider';sliderMaster.resize(276,28);sliderMaster.x=1500;sliderMaster.y=100;sliderMaster.fills=[];sliderMaster.description='Zinc native Slider. Value, Min, Max, Step are numeric inputs; Outlet binds application state; Action emits a numeric change event.';
const field=sliderSet.defaultVariant.createInstance();sliderMaster.appendChild(field);field.setProperties({'Has Label#589:5':false,'Has Description#589:6':false});field.resize(276,28);field.x=0;field.y=0;
const sliderProps={};for(const [name,value]of Object.entries({Value:'72',Min:'0',Max:'100',Step:'1',Outlet:'salon.brightness',Action:'salon.brightnessChanged'}))sliderProps[name]=sliderMaster.addComponentProperty(name,'TEXT',value);
function replace(old,instance){const parent=old.parent,index=parent.children.indexOf(old),w=old.width,h=old.height,x=old.x,y=old.y;parent.insertChild(index,instance);instance.resize(w,h);instance.x=x;instance.y=y;instance.name=old.name;old.remove();changed.push(old.id);return instance;}
const slider=replace(await node('4:295'),sliderMaster.createInstance());slider.name='control:salon.brightness';
const switches=[];
for(const on of [true,false]){const c=figma.createComponent();c.name='Checked='+String(on);c.resize(36,24);c.fills=[];const i=switchSet.children.find(v=>v.name==='State=Default, Value Type='+(on?'Checked':'Unchecked')).createInstance();c.appendChild(i);i.setProperties({'Has Label#373:0':false,'Has Description#2137:0':false});i.resize(36,24);switches.push(c);}
const toggleMaster=figma.combineAsVariants(switches,page);toggleMaster.name='Maison / Native / Switch';toggleMaster.x=1500;toggleMaster.y=200;toggleMaster.resize(160,70);switches.forEach((c,i)=>{c.x=i*70;c.y=0;});toggleMaster.description='Zinc native Switch. Checked is boolean; Outlet is a typed state binding; Action emits a boolean toggle.';
const toggleProps={};for(const name of ['Outlet','Action'])toggleProps[name]=toggleMaster.addComponentProperty(name,'TEXT','');
for(const [id,on,outlet,event]of [['4:286',true,'salon.light','salon.lightChanged'],['4:349',false,'chambre.light','chambre.lightChanged'],['4:368',false,'chambre.cover','chambre.coverChanged']]){const c=switches.find(c=>c.name==='Checked='+String(on));const i=replace(await node(id),c.createInstance());i.name='control:'+outlet;i.setProperties({[toggleProps.Outlet]:outlet,[toggleProps.Action]:event});}
// Repeated scene tiles become true instances with text and icon swap properties.
const sceneSources=await Promise.all(['4:188','4:199','4:214','4:222'].map(node));
const iconMasters=[];
for(let i=0;i<sceneSources.length;i++){const source=sceneSources[i].children[0];const copy=source.clone();page.appendChild(copy);copy.x=1800+i*60;copy.y=100;const icon=figma.createComponentFromNode(copy);icon.name='Maison / Icon / '+['Coffee','Sunset','Moon','Leave'][i];icon.description='Lucide vector icon; editable paths, used through an instance-swap property.';iconMasters.push(icon);}
const variants=[];
for(const [i,tone]of [[0,'Neutral'],[1,'Warm']]){const copy=sceneSources[i].clone();page.appendChild(copy);const c=figma.createComponentFromNode(copy);c.name='Tone='+tone;variants.push(c);}
const sceneMaster=figma.combineAsVariants(variants,page);sceneMaster.name='Maison / Scene';sceneMaster.x=1500;sceneMaster.y=320;sceneMaster.resize(520,100);variants.forEach((c,i)=>{c.x=i*260;c.y=0;});sceneMaster.description='Reusable scene action with a label and interchangeable Lucide icon.';
const labelProp=sceneMaster.addComponentProperty('Label','TEXT','Bonjour');const iconProp=sceneMaster.addComponentProperty('Icon','INSTANCE_SWAP',iconMasters[0].id);
for(const c of variants){const t=c.findAllWithCriteria({types:['TEXT']})[0];t.componentPropertyReferences={characters:labelProp};const old=c.children[0],i=iconMasters[0].createInstance();replace(old,i);i.componentPropertyReferences={mainComponent:iconProp};}
for(let i=0;i<sceneSources.length;i++){const old=sceneSources[i],c=variants[i===1?1:0];const instance=replace(old,c.createInstance());instance.name='action:scene.'+['morning','evening','night','away'][i];instance.setProperties({[labelProp]:['Bonjour','Soirée douce','Bonne nuit','Je pars'][i],[iconProp]:iconMasters[i].id});}
for(const [id,name]of Object.entries({'4:293':'outlet:salon.brightnessLabel','4:305':'outlet:salon.temperature','4:283':'outlet:salon.lightState','4:346':'outlet:chambre.lightState','4:365':'outlet:chambre.coverState','4:149':'outlet:energy.today','4:77':'outlet:connection.status','4:311':'action:climate.decrease','4:314':'action:climate.increase','4:67':'action:connection.open','4:33':'action:navigate.rooms','4:41':'action:navigate.devices','4:48':'action:navigate.scenes','4:56':'action:navigate.energy','4:26':'action:navigate.home'})){const n=await node(id);n.name=name;changed.push(n.id);}
// A solid translucent scrim is supported by both Figma and the native runtime.
const scrim=await node('4:120');scrim.fills=[{type:'SOLID',color:{r:.06,g:.12,b:.08},opacity:.4}];
// Remove the clipped narrow house caption; retain the intended editable label.
const house=await node('4:13');house.resize(172,70);const houseText=await node('4:17');houseText.resize(125,50);
contractKeys.slider=sliderMaster.key;contractKeys.switch=toggleMaster.key;
const masters=[sliderMaster,toggleMaster,sceneMaster,...iconMasters];for(const c of masters){made.push(c.id,...c.findAll(()=>true).map(n=>n.id));}
return{createdNodeIds:made,mutatedNodeIds:[...changed,...root.findAll(()=>true).map(n=>n.id)],contracts:contractKeys,sliderProps,toggleProps,masters:masters.map(c=>({id:c.id,name:c.name,key:c.key})),instanceCount:root.findAllWithCriteria({types:['INSTANCE']}).length};
