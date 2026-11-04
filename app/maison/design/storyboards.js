const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);
await Promise.all(['Regular','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
const root=await figma.getNodeByIdAsync('4:2'),created=[],mutated=[];
const node=id=>figma.getNodeByIdAsync(id);
function label(parent,name,value,size=16){const n=figma.createText();parent.appendChild(n);n.name=name;n.fontName={family:'Manrope',style:'Regular'};n.fontSize=size;n.characters=value;n.fills=[{type:'SOLID',color:{r:.125,g:.227,b:.196}}];return n;}
function frame(parent,name,w,h,mode='VERTICAL'){const n=figma.createAutoLayout(mode);parent.appendChild(n);n.name=name;n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';n.fills=[];return n;}
const main=await node('4:81');main.name='layout:content';main.overflowDirection='VERTICAL';main.clipsContent=true;main.layoutSizingHorizontal='FILL';
const sidebar=await node('4:5');sidebar.name='layout:sidebar';sidebar.layoutSizingVertical='FILL';
// Convert the activity feed to an explicit native scroll contract, preserving its editable rows.
const feed=await node('4:398'),parent=feed.parent,index=parent.children.indexOf(feed),copy=feed.clone();page.appendChild(copy);const feedMaster=figma.createComponentFromNode(copy);feedMaster.name='Maison / Native / ActivityFeed';feedMaster.x=1500;feedMaster.y=520;feedMaster.description='Native ScrollView; StickToBottom follows new activity only while the reader is already at the end.';
const feedProps={StickToBottom:feedMaster.addComponentProperty('StickToBottom','BOOLEAN',true),Outlet:feedMaster.addComponentProperty('Outlet','TEXT','activity')};
const feedInstance=feedMaster.createInstance();parent.insertChild(index,feedInstance);feedInstance.resize(feed.width,feed.height);feed.remove();feedInstance.name='outlet:activity';
// Native data-driven device list: the single editable row is a template, not production data.
const listMaster=figma.createComponent();listMaster.name='Maison / Native / DeviceList';listMaster.resize(900,650);listMaster.x=1500;listMaster.y=700;listMaster.layoutMode='VERTICAL';listMaster.itemSpacing=12;listMaster.fills=[];listMaster.description='Native VirtualList. Items names a typed TS collection; ItemHeight fixes row geometry; ItemKey is entity id.';
const listProps={Items:listMaster.addComponentProperty('Items','TEXT','house.devices'),ItemHeight:listMaster.addComponentProperty('ItemHeight','TEXT','80')};
const row=(await node('4:274')).clone();listMaster.appendChild(row);row.name='template:DeviceRow';row.resize(900,72);
const devices=figma.createAutoLayout('HORIZONTAL');devices.name='Maison / Devices / Tablet';devices.resize(1280,900);devices.primaryAxisSizingMode='FIXED';devices.counterAxisSizingMode='FIXED';devices.x=100;devices.y=1200;devices.fills=root.fills;
const nav=sidebar.clone();devices.appendChild(nav);nav.layoutSizingVertical='FILL';
const listContent=frame(devices,'layout:content',1072,900);listContent.layoutSizingHorizontal='FILL';listContent.paddingTop=32;listContent.paddingLeft=32;listContent.paddingRight=32;listContent.paddingBottom=32;listContent.itemSpacing=24;
label(listContent,'Text / Heading','Tous vos appareils',30);label(listContent,'outlet:devices.summary','Quatre appareils, une maison qui vous ressemble.',14);
const list=listMaster.createInstance();listContent.appendChild(list);list.name='outlet:house.devices';list.layoutSizingHorizontal='FILL';list.layoutSizingVertical='FILL';
const portrait=root.clone();page.appendChild(portrait);portrait.name='Maison / Overview / Portrait';portrait.x=1500;portrait.y=1200;portrait.resize(834,1194);
const mobile=root.clone();page.appendChild(mobile);mobile.name='Maison / Overview / Mobile';mobile.x=2450;mobile.y=1200;mobile.resize(390,844);
function hasText(n,text){return 'children'in n&&n.findAllWithCriteria({types:['TEXT']}).some(t=>t.characters===text);}
function adapt(screen,phone){
 const side=screen.children[0],content=screen.children[1];
 if(phone){side.visible=false;content.resize(390,844);content.paddingLeft=20;content.paddingRight=20;content.paddingTop=24;content.paddingBottom=24;}
 else {side.resize(72,1194);side.paddingLeft=14;side.paddingRight=14;for(const t of side.findAllWithCriteria({types:['TEXT']}))t.visible=false;side.children[1].visible=false;content.resize(762,1194);content.paddingLeft=24;content.paddingRight=24;}
 content.layoutSizingHorizontal='FILL';content.layoutSizingVertical='FILL';content.overflowDirection='VERTICAL';content.clipsContent=true;
 const header=content.children[0],heroRow=content.children[1],sceneSection=content.children[2],bottom=content.children[3];
 header.layoutSizingHorizontal='FILL';if(phone)header.children[1].visible=false;
 heroRow.layoutSizingHorizontal='FILL';heroRow.layoutMode=phone?'VERTICAL':'HORIZONTAL';heroRow.primaryAxisSizingMode='AUTO';
 heroRow.children[0].layoutSizingHorizontal='FILL';if(phone)heroRow.children[1].visible=false;else heroRow.children[1].resize(250,242);
 const scenes=sceneSection.children[1];sceneSection.layoutSizingHorizontal='FILL';sceneSection.primaryAxisSizingMode='AUTO';scenes.layoutSizingHorizontal='FILL';scenes.layoutWrap='WRAP';scenes.primaryAxisSizingMode='AUTO';scenes.counterAxisSpacing=12;
 for(const tile of scenes.children){tile.resize(phone?168:339,60);tile.layoutGrow=1;}
 bottom.layoutMode='VERTICAL';bottom.primaryAxisSizingMode='AUTO';bottom.layoutSizingHorizontal='FILL';
 const rooms=bottom.children[0],right=bottom.children[1];rooms.layoutSizingHorizontal='FILL';rooms.primaryAxisSizingMode='AUTO';right.layoutSizingHorizontal='FILL';right.primaryAxisSizingMode='AUTO';
 const tabs=rooms.children[1];tabs.layoutWrap='WRAP';tabs.primaryAxisSizingMode='AUTO';tabs.layoutSizingHorizontal='FILL';
 const cards=rooms.children[2];cards.layoutSizingHorizontal='FILL';cards.primaryAxisSizingMode='AUTO';if(phone)cards.layoutMode='VERTICAL';
 for(const card of cards.children)card.layoutSizingHorizontal='FILL';
 for(const item of content.children)item.layoutSizingHorizontal='FILL';
 return screen;
}
adapt(portrait,false);adapt(mobile,true);
// Bind prototype navigation and business actions to named buttons, retaining typed event semantics in Zinc.
const tr={type:'DISSOLVE',duration:.18,easing:{type:'EASE_OUT'}};
for(const screen of [root,portrait,mobile,devices]){
 for(const n of screen.findAll(n=>n.name.startsWith('action:'))){const action=n.name.slice(7);const target=action==='navigate.home'?root:action==='navigate.devices'||action==='navigate.rooms'?devices:null;if(target&&target.id!==screen.id)await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',navigation:'NAVIGATE',destinationId:target.id,transition:tr}]}]);}
}
// Link size-class screens so the exported storyboard includes every responsive alternative.
for(const [screen,target]of [[root,portrait],[portrait,mobile],[mobile,root]]){const n=label(screen,'action:preview.nextSize','Autre format',10);n.layoutPositioning='ABSOLUTE';n.x=screen.width-90;n.y=screen.height-20;await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',navigation:'NAVIGATE',destinationId:target.id,transition:tr}]}]);}
const connection=frame(page,'Maison / Connection',540,460);connection.x=2950;connection.y=1200;connection.paddingTop=32;connection.paddingLeft=32;connection.paddingRight=32;connection.paddingBottom=32;connection.itemSpacing=24;connection.cornerRadius=24;connection.fills=[{type:'SOLID',color:{r:.96,g:.957,b:.937}}];
label(connection,'Text / Heading','Votre Home Assistant',28);label(connection,'Text / Body','Connectez votre maison. Le mode démo reste disponible.',14);label(connection,'outlet:connection.address','http://homeassistant.local:8123',15);label(connection,'Text / Token','Jeton d’accès personnel · conservé en mémoire',12);label(connection,'action:connection.connect','Se connecter',16);label(connection,'action:connection.demo','Continuer en mode démo',14);
for(const screen of [root,portrait,mobile,devices])for(const n of screen.findAll(n=>n.name==='action:connection.open'))await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',navigation:'OVERLAY',destinationId:connection.id,transition:tr}]}]);
// A small native opacity entrance, rather than a large motion effect on every data refresh.
const hero=await node('4:118');hero.applyManualKeyframeTrack({type:'PROPERTY',name:'OPACITY'},{keyframes:[{timelinePosition:0,value:{type:'FLOAT',value:0},easing:{type:'LINEAR'}},{timelinePosition:.35,value:{type:'FLOAT',value:1},easing:{type:'EASE_OUT'}}]});
const timelines=root.timelines;if(timelines.length)root.setTimelineDuration(timelines[0].id,Math.max(.35,timelines[0].duration));
const roots=[root,portrait,mobile,devices,connection,feedMaster,listMaster];for(const r of roots){created.push(r.id,...r.findAll(()=>true).map(n=>n.id));}
return{createdNodeIds:created,mutatedNodeIds:[main.id,sidebar.id,'4:398'],screens:roots.slice(0,5).map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),contracts:{feed:feedMaster.key,list:listMaster.key},feedProps,listProps,instances:root.findAllWithCriteria({types:['INSTANCE']}).length};
