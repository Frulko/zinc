const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);await Promise.all(['Regular','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'Manrope',style})));
const changed=[],created=[];
const color=await figma.variables.getVariableByIdAsync('VariableID:7:94');
for(const id of ['4:2','10:1306','10:1629']){
 const r=await figma.getNodeByIdAsync(id),phone=r.width<600,content=r.children[1],scenes=content.children[2].children[1],bottom=content.children[3],rooms=bottom.children[0],cards=rooms.children[2];
 if(r.width<1000){
  scenes.primaryAxisSizingMode='FIXED';scenes.counterAxisSizingMode='AUTO';scenes.layoutSizingHorizontal='FILL';scenes.layoutWrap='WRAP';scenes.minWidth=null;scenes.maxWidth=null;
  for(const tile of scenes.children){tile.minWidth=null;tile.maxWidth=null;tile.resize(phone?168:339,60);tile.layoutSizingHorizontal='FIXED';tile.layoutGrow=0;}
  bottom.layoutSizingVertical='HUG';rooms.layoutSizingVertical='HUG';rooms.layoutSizingHorizontal='FILL';cards.layoutSizingHorizontal='FILL';
  if(phone){cards.layoutMode='VERTICAL';cards.layoutSizingVertical='HUG';}else{cards.primaryAxisSizingMode='FIXED';cards.counterAxisSizingMode='AUTO';}
  for(const card of cards.children){card.minWidth=null;card.layoutSizingHorizontal='FILL';}
 }
 // Prevent a solid white variable from replacing the intended translucent badge.
 const badge=content.children[1].children[0].children[1].children[0];badge.fills=[{type:'SOLID',color:{r:1,g:1,b:1},opacity:.16}];
 for(const n of r.findAllWithCriteria({types:['TEXT']}))if(n.fontSize===figma.mixed){
  const segments=n.getStyledTextSegments(['fontName','fontSize','fills','letterSpacing','lineHeight']);const parent=n.parent,index=parent.children.indexOf(n);const row=figma.createAutoLayout('HORIZONTAL');parent.insertChild(index,row);row.name='Text / Measure';row.counterAxisAlignItems='MAX';row.itemSpacing=0;row.fills=[];
  for(let i=0;i<segments.length;i++){const s=segments[i],t=figma.createText();row.appendChild(t);t.name=i===0?n.name:'Text / Unit';t.fontName=s.fontName;t.fontSize=s.fontSize;t.characters=s.characters;t.fills=s.fills;t.letterSpacing=s.letterSpacing;t.lineHeight=s.lineHeight;created.push(t.id);}
  created.push(row.id);changed.push(n.id);n.remove();
 }
 changed.push(r.id,...r.findAll(()=>true).map(n=>n.id));
}
return{createdNodeIds:created,mutatedNodeIds:changed,changedScreens:['4:2','10:1306','10:1629']};
