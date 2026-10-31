"""Synthetic Classic identity records. Never collected from a real iPod."""
import struct


def make_syscfg(converted=True, **overrides):
    fields = {
        'Mod#': b'MC297' if converted else b'MB565',
        'SwVr': b'2.0.2' if converted else b'2.0',
        'HwVr': b'\0' * 4 + struct.pack('<I', 0x130200 if converted else 0x130100),
        'FwId': b'new-firmware' if converted else b'old-firmware',
        'SrNm': b'TEST00009ZU' if converted else b'TEST00002C7',
        'HwId': b'SAME-TEST-BOARD',
        'Regn': b'TEST-REGION',
    }
    fields.update(overrides)
    records = b''.join(k[::-1].encode() + v.ljust(16, b'\0') for k, v in fields.items())
    return struct.pack('<6I', 0x53436667, 24 + len(records), 8192, 0x10001, 0, len(fields)) + records


if __name__ == '__main__':
    from pathlib import Path
    import sys
    out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    (out / 'current.syscfg').write_bytes(make_syscfg())
    (out / 'reference.syscfg').write_bytes(make_syscfg(False))
