"""Malformed glTF skin buffers remain structurally valid; the importer must validate their values."""
import json
from pathlib import Path
import struct
import sys

original = Path(sys.argv[1]).read_bytes()
length = struct.unpack_from('<I', original, 12)[0]
document = json.loads(original[20:20+length])
binary_at = 20+length+8
attributes = document['meshes'][0]['primitives'][0]['attributes']
for kind, attribute in [('weights','WEIGHTS_0'),('joints','JOINTS_0')]:
    data = bytearray(original)
    accessor = document['accessors'][attributes[attribute]]
    view = document['bufferViews'][accessor['bufferView']]
    offset = binary_at+view.get('byteOffset',0)+accessor.get('byteOffset',0)
    fmt = {5121:'B',5123:'H',5126:'f'}[accessor['componentType']]
    struct.pack_into('<4'+fmt, data, offset, *([0]*4 if kind=='weights' else [255]*4))
    (Path(sys.argv[2])/(kind+'.glb')).write_bytes(data)
