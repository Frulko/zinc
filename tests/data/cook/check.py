"""Independent ZCK1 layout and receipt checks; no production reader involved."""
import base64
import json
import math
from pathlib import Path
import struct
import sys

root = Path(sys.argv[1])
profiles = ("psp30", "vita60", "n3ds30", "ios60")


def receipt(path, profile, triangles):
    rc = json.loads(path.read_text())
    assert rc["profile"] == profile, rc
    assert type(rc["vertices"]) is int and rc["vertices"] > 0, rc
    assert type(rc["triangles"]) is int and rc["triangles"] == triangles, rc
    assert type(rc["quantError"]) in (int, float), rc
    assert math.isfinite(rc["quantError"]) and rc["quantError"] >= 0, rc
    assert [lod["name"] for lod in rc["lod"]] == ["lod0", "lod1"], rc
    counts = [lod["triangles"] for lod in rc["lod"]]
    assert all(type(n) is int for n in counts), rc
    assert counts[0] == triangles and 0 <= counts[1] <= counts[0], rc
    return rc


def pack(path, profile, rc):
    data = path.read_bytes()
    offset = 0

    def read(fmt):
        nonlocal offset
        size = struct.calcsize(fmt)
        assert offset + size <= len(data), (path, offset, fmt)
        values = struct.unpack_from(fmt, data, offset)
        offset += size
        return values

    assert read("<4s")[0] == b"ZCK1", path
    length, = read("<I")
    assert length == len(profile), path
    assert read(f"<{length}s")[0] == profile.encode(), path
    minimum = read("<3f")
    extent = read("<3f")
    assert all(math.isfinite(n) for n in minimum + extent), path
    assert all(n > 0 for n in extent), path
    vertices, = read("<I")
    assert vertices == rc["vertices"], path
    # Exactly three signed 16-bit position components + three colour bytes per vertex.
    positions = [read("<3h3B")[:3] for _ in range(vertices)]
    assert all(0 <= q <= 32767 for p in positions for q in p), path
    indices, = read("<I")
    assert indices == rc["triangles"] * 3, path
    assert all(read("<H")[0] < vertices for _ in range(indices)), path
    assert offset == len(data), (path, offset, len(data))
    return minimum, extent, positions


for profile in profiles:
    rc = receipt(root / "a" / f"{profile}.receipt.json", profile, 408)
    if profile == "psp30":
        pack(root / "a" / f"{profile}.zcook", profile, rc)
    print(f"{profile}: {rc['vertices']} vertices, {rc['triangles']} triangles, "
          f"LOD {[lod['triangles'] for lod in rc['lod']]}, quantError={rc['quantError']}")

fixture = json.loads(Path(sys.argv[2]).read_text())
source = base64.b64decode(fixture["buffers"][0]["uri"].split(",", 1)[1])
source_positions = list(struct.iter_unpack("<3f", source[:48]))
for folder, profile in [(root / "cli", "psp30")] + [(root / f"budget-{p}", p) for p in profiles]:
    rc = receipt(folder / f"{profile}.receipt.json", profile, 2)
    minimum, extent, positions = pack(folder / f"{profile}.zcook", profile, rc)
    assert len(positions) == len(source_positions) == 4
    decoded = [tuple(lo + q / 32767 * span for lo, q, span in zip(minimum, p, extent))
               for p in positions]
    # X uses only box endpoints: Y/Z must contribute to the measured error.
    assert all(p[0] == s[0] for p, s in zip(decoded, source_positions))
    expected = sum(math.dist(p, s) for p, s in zip(decoded, source_positions)) / len(positions)
    assert expected > 1e-6
    assert math.isclose(rc["quantError"], expected, rel_tol=1e-5), (rc, expected)
    assert expected <= math.sqrt(sum((e / 32767) ** 2 for e in extent))
    print(f"{folder.name}: decoded XYZ mean error={expected:.12g} source units")
