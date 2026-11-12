import copy, json, pathlib, struct, sys
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
positions=[0.,0.,0.,1.,0.,0.,0.,1.,0.]
colors=[.2,.4,.6]*3
binary=struct.pack('<18f3H',*(positions+colors),0,1,2)
(out/'mesh.bin').write_bytes(binary)
base={
 'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],
 'nodes':[{'translation':[2,0,0],'children':[1,2]},
          {'mesh':0,'rotation':[0,0,2**-.5,2**-.5],'scale':[2,1,1]},
          {'mesh':0,'matrix':[1,0,0,0,0,1,0,0,0,0,1,0,0,3,0,1]}],
 'buffers':[{'uri':'mesh.bin','byteLength':len(binary)}],
 'bufferViews':[{'buffer':0,'byteLength':36},{'buffer':0,'byteOffset':36,'byteLength':36},{'buffer':0,'byteOffset':72,'byteLength':6}],
 'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3'},
              {'bufferView':1,'componentType':5126,'count':3,'type':'VEC3'},
              {'bufferView':2,'componentType':5123,'count':3,'type':'SCALAR'}],
 'meshes':[{'primitives':[{'attributes':{'POSITION':0,'COLOR_0':1},'indices':2,'material':0}]}],
 'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[.5,.25,.125,.4],'roughnessFactor':.5},
               'doubleSided':True,'alphaMode':'BLEND',
               'extensions':{'KHR_materials_specular':{'specularFactor':.5,'specularColorFactor':[.5,.25,.125]}}}],
 'extensionsUsed':['KHR_materials_specular'],'extensionsRequired':['KHR_materials_specular']}
def save(name,obj): (out/(name+'.gltf')).write_text(json.dumps(obj,separators=(',',':')).replace('Infinity','1e309'))
save('model',base)
o=copy.deepcopy(base);o['scenes'].append({'nodes':[0]});save('multi-scene',o)
for name,roughness in [('rough',1),('smooth',0)]:
 o=copy.deepcopy(base);o['materials'][0]['pbrMetallicRoughness']['roughnessFactor']=roughness;save(name,o)
o=copy.deepcopy(base);o['materials'][0]['extensions']['KHR_materials_unlit']={};o['extensionsUsed'].append('KHR_materials_unlit');save('forbidden-unlit',o)
o=copy.deepcopy(base);o['materials'][0]['extensions']['KHR_materials_pbrSpecularGlossiness']={};o['extensionsUsed'].append('KHR_materials_pbrSpecularGlossiness');save('forbidden-specular-glossiness',o)
o=copy.deepcopy(base);o['materials'][0]['extensions']['KHR_materials_unlit']={};o['materials'][0]['extensions'].pop('KHR_materials_specular');o['extensionsUsed']=['KHR_materials_unlit'];o['extensionsRequired']=['KHR_materials_unlit'];save('unlit',o)
o=copy.deepcopy(base);o['materials'][0].pop('extensions');o.pop('extensionsUsed');o.pop('extensionsRequired');save('default',o)
o=copy.deepcopy(base);o['images']=[{'uri':'does-not-exist.jpg'}];o['textures']=[{'source':0}];o['materials'][0]['pbrMetallicRoughness']['baseColorTexture']={'index':0};save('geometry-no-images',o)
for name,change in [
 ('cycle',lambda o:o['nodes'][2].update(children=[0])),
 ('dag',lambda o:o['nodes'][0].update(children=[1,2,2])),
 ('roots',lambda o:o['scenes'][0].update(nodes=[0,1])),
 ('bad-node',lambda o:o['nodes'][0].update(children=[30])),
 ('missing-buffer',lambda o:o['buffers'][0].update(uri='missing.bin')),
 ('infinite-specular',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularFactor=1e309)),
 ('boolean-specular',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularFactor=True)),
 ('bad-specular',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularFactor=2)),
 ('bad-colour',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularColorFactor=[1,None,1])),
 ('bad-roughness',lambda o:o['materials'][0]['pbrMetallicRoughness'].update(roughnessFactor=-.1)),
 ('texture',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularTexture={'index':0})),
 ('colour-texture',lambda o:o['materials'][0]['extensions']['KHR_materials_specular'].update(specularColorTexture={'index':0}))]:
 o=copy.deepcopy(base);change(o);save(name,o)
o=copy.deepcopy(base);o.pop('extensionsRequired');o['materials'][0]['extensions']['KHR_materials_specular']['specularTexture']={'index':0};save('optional-texture',o)
o=copy.deepcopy(base);o['nodes']=[{'children':[i+1]} for i in range(65)]+[{}];save('deep',o)
o=copy.deepcopy(base);o['nodes']=[{}]*65537;save('node-budget',o)
o=copy.deepcopy(base);o['nodes'][0]['translation']=[1e309,0,0];save('infinite-transform',o)
o=copy.deepcopy(base);(out/'nan.bin').write_bytes(struct.pack('<f',float('nan'))+binary[4:]);o['buffers'][0]['uri']='nan.bin';save('nan-positions',o)
# One already-bounded source buffer: reject the requested CPU copy before appending any output values.
count=349526
(out/'large.bin').write_bytes(bytes(count*12))
o=copy.deepcopy(base);o['nodes']=[{'mesh':0}];o['buffers']=[{'uri':'large.bin','byteLength':count*12}];o['bufferViews']=[{'buffer':0,'byteLength':count*12}];o['accessors']=[{'bufferView':0,'componentType':5126,'count':count,'type':'VEC3'}];o['meshes'][0]['primitives'][0]={'attributes':{'POSITION':0}};save('budget',o)

# Tiny inputs with oversized auxiliary metadata must fail before accessor/meshopt decoding.
for attr in ['NORMAL','TEXCOORD_0','COLOR_0']:
 o=copy.deepcopy(base);o['accessors'].append(dict(o['accessors'][0],count=100000000));o['meshes'][0]['primitives'][0]['attributes'][attr]=len(o['accessors'])-1;save('count-'+attr.lower(),o)
 o=copy.deepcopy(base);o['bufferViews'].append({'buffer':0,'byteLength':12,'extensions':{'EXT_meshopt_compression':{'buffer':0,'byteLength':1,'count':10000000,'byteStride':12,'mode':'ATTRIBUTES'}}});o['accessors'].append(dict(o['accessors'][0],bufferView=len(o['bufferViews'])-1));o['meshes'][0]['primitives'][0]['attributes'][attr]=len(o['accessors'])-1;save('compressed-'+attr.lower(),o)

o=copy.deepcopy(base)
for i in range(2):
 o['bufferViews'].append({'buffer':0,'byteLength':12,'extensions':{'EXT_meshopt_compression':{'buffer':0,'byteLength':1,'count':1310720,'byteStride':4,'mode':'ATTRIBUTES'}}})
save('compressed-cumulative',o)
