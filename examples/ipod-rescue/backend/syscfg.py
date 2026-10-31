"""Read-only decoder for the documented Classic SysCfg record format; no NOR I/O."""
import hashlib
from pathlib import Path
import struct


MAX_SYSCFG = 8192


def parse(raw):
    if len(raw) < 24 or len(raw) > MAX_SYSCFG:
        raise ValueError('Dump SysCFG attendu : 24 à 8192 octets, pas une image NOR complète.')
    magic, size, capacity, version, reserved, count = struct.unpack_from('<6I', raw)
    if (magic, capacity, version, reserved) != (0x53436667, MAX_SYSCFG, 0x10001, 0) or size != 24 + count * 20 or size > len(raw):
        raise ValueError('En-tête ou taille SysCFG invalide.')
    records = {}
    for tag, value in struct.iter_unpack('<4s16s', raw[24:size]):
        if any(b < 33 or b > 126 for b in tag):
            raise ValueError('Nom de champ SysCFG invalide.')
        key = tag[::-1].decode('ascii')
        if key in records:
            raise ValueError('Champ SysCFG dupliqué.')
        records[key] = value
    if not all(k in records for k in ('Mod#', 'HwVr', 'SwVr', 'FwId', 'SrNm', 'HwId')):
        raise ValueError('Dump SysCFG incomplet : champs d’identité manquants.')
    def text(key):
        data = records[key]
        value = data.rstrip(b'\0')
        if not value or any(b < 33 or b > 126 for b in value):
            raise ValueError('Texte d’identité SysCFG invalide.')
        return value.decode('ascii')
    return dict(records=records, model=text('Mod#'), software=text('SwVr'),
                serial=text('SrNm'), hardware=struct.unpack_from('<I', records['HwVr'], 4)[0],
                sha256=hashlib.sha256(raw).hexdigest())


def read(path):
    p = Path(path).expanduser().resolve(strict=True)
    from host import read_relative
    return parse(read_relative(p.parent, p.name, MAX_SYSCFG))
