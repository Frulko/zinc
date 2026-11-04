const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);
await Promise.all(['Regular','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
const root=await figma.getNodeByIdAsync('4:2');
const created=[],mutated=[];
page.name='Maison / Storyboards';root.name='Maison / Overview / Tablet';root.x=100;root.y=100;mutated.push(page.id,root.id);
const bad=await figma.getNodeByIdAsync('2:2');if(bad){bad.remove();mutated.push('2:2');}
// Based on the skill's createVariableCollection helper; reused collections are kept intact.
async function collection(name,modes){let c=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name===name);if(!c){c=figma.variables.createVariableCollection(name);c.renameMode(c.defaultModeId,modes[0]);for(const m of modes.slice(1))c.addMode(m);}return c;}
const prim=await collection('Maison / Primitives',['Value']);const semantic=await collection('Maison / Color',['Light','Dark']);const geo=await collection('Maison / Geometry',['Value']);
const palette={canvas:'f5f4ef',sidebar:'eaece4',surface:'fffefb',ink:'203a32',primary:'244d3d',muted:'7a857c',border:'e9e9e0',sage:'e3e8db',accent:'78916a',amber:'f0e6d3',amberInk:'846640',white:'ffffff',off:'e4e7df',track:'e7eadf'};
const color=s=>({r:parseInt(s.slice(0,2),16)/255,g:parseInt(s.slice(2,4),16)/255,b:parseInt(s.slice(4,6),16)/255,a:1});
const variables=await figma.variables.getLocalVariablesAsync();const byName=new Map(variables.map(v=>[v.variableCollectionId+'/'+v.name,v]));
function variable(c,name,type,scopes){let v=byName.get(c.id+'/'+name);if(!v){v=figma.variables.createVariable(name,c,type);created.push(v.id);byName.set(c.id+'/'+name,v);}v.scopes=scopes;v.setVariableCodeSyntax('WEB','var(--maison-'+name.replaceAll('/','-')+')');return v;}
const colors={};
for(const [name,hex] of Object.entries(palette)){
 const p=variable(prim,name,'COLOR',[]);p.setValueForMode(prim.defaultModeId,color(hex));
 const v=variable(semantic,name,'COLOR',['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR']);v.setValueForMode(semantic.modes[0].modeId,{type:'VARIABLE_ALIAS',id:p.id});
 const dark={canvas:'18241e',sidebar:'1e2e25',surface:'25392e',ink:'f0f1e8',muted:'b2beac',border:'3b5142',sage:'314a37',off:'4a5e4c',track:'496044'}[name];v.setValueForMode(semantic.modes[1].modeId,dark?color(dark):{type:'VARIABLE_ALIAS',id:p.id});colors[name]=v;
}
const nums={};function number(role,value){const name=role+'/'+String(Math.round(value*1000)/1000).replace('.','_');if(!nums[name]){const v=variable(geo,name,'FLOAT',role==='radius'?['CORNER_RADIUS']:['GAP']);v.setValueForMode(geo.defaultModeId,value);nums[name]=v;}return nums[name];}
const styles=new Map((await figma.getLocalTextStylesAsync()).map(s=>[s.name,s]));
const textStyles=[];
const all=[root,...root.findAll(()=>true)];
for(const n of all){
 mutated.push(n.id);
 for(const field of ['fills','strokes'])if(Array.isArray(n[field]))n[field]=n[field].map(p=>{
  if(p.type!=='SOLID')return p;
  let best=null,distance=.03;
  for(const [name,hex] of Object.entries(palette)){const c=color(hex),d=Math.abs(c.r-p.color.r)+Math.abs(c.g-p.color.g)+Math.abs(c.b-p.color.b);if(d<distance){best=colors[name];distance=d;}}
  return best?figma.variables.setBoundVariableForPaint(p,'color',best):p;
 });
 if(n.type==='TEXT'&&n.fontName!==figma.mixed&&n.fontSize!==figma.mixed&&n.lineHeight!==figma.mixed&&n.letterSpacing!==figma.mixed){
  const family=n.fontName.family,style=n.fontName.style,size=n.fontSize;
  const key='Maison / Type / '+size+' / '+style;
  let t=styles.get(key);if(!t){t=figma.createTextStyle();t.name=key;t.fontName={family,style};t.fontSize=size;t.lineHeight=n.lineHeight;t.letterSpacing=n.letterSpacing;styles.set(key,t);textStyles.push(t.id);}
  await n.setTextStyleIdAsync(t.id);
 }
 if('layoutMode'in n&&n.layoutMode!=='NONE')for(const field of ['itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft'])if(n[field]>0&&n[field]<=48)n.setBoundVariable(field,number('space',n[field]));
 if(typeof n.cornerRadius==='number'&&n.cornerRadius>0&&n.cornerRadius<=32)n.setBoundVariable('cornerRadius',number('radius',n.cornerRadius));
}
return{createdNodeIds:created,mutatedNodeIds:mutated,collections:{primitives:prim.id,color:semantic.id,geometry:geo.id},variables:Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,v.id])),textStyleIds:textStyles,textCount:all.filter(n=>n.type==='TEXT').length,images:all.filter(n=>Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>n.id),root:root.id};
