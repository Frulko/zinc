"""Passive macOS evidence collection and bounded local firmware inspection."""
import hashlib
from datetime import date, datetime
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import stat
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

from model import digest

MAX_IMAGE = 256 * 1024 * 1024


def json_evidence(value):
    if isinstance(value, bytes):
        return dict(encoding='hex', data=value.hex())
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_evidence(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_evidence(v) for v in value]
    return value


def command(args):
    # Fixed executable/argv callers only; never a shell or a user-supplied command.
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace').strip()[:1000] or 'Commande de diagnostic refusée.')
    return result.stdout


def plist(args):
    raw = command(args)
    try:
        return plistlib.loads(raw)
    except (ValueError, plistlib.InvalidFileException):
        # Apple's parser accepts some device plists that Python's stricter parser rejects.
        return json.loads(subprocess.run(['/usr/bin/plutil', '-convert', 'json', '-o', '-', '-'],
                          input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=10, check=True).stdout)


def read_relative(root, relative, limit=MAX_IMAGE):
    """No-follow traversal keeps a removable volume's symlinks out of the host filesystem."""
    parts = PurePosixPath(relative).parts
    if not parts or any(p in ('..', '.', '/') for p in parts):
        raise ValueError('Chemin de sauvegarde invalide.')
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(child, 'rb') as f:
            before = os.fstat(f.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
                raise ValueError('Fichier non régulier ou trop volumineux.')
            data = f.read(limit + 1)
            after = os.fstat(f.fileno())
            if len(data) != before.st_size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError('Le fichier a changé pendant sa lecture.')
            return data
    finally:
        os.close(fd)


def metadata(mount):
    info, extended, warnings = {}, {}, []
    if not mount:
        return info, json_evidence(extended), warnings
    for name in ('SysInfo', 'SysInfoExtended'):
        try:
            raw = read_relative(mount, 'iPod_Control/Device/' + name, 2 * 1024 * 1024)
            if name == 'SysInfo':
                info = dict(line.split(':', 1) for line in raw.decode(errors='replace').splitlines() if ':' in line)
                info = {k.strip(): v.strip() for k, v in info.items()}
            else:
                try:
                    extended = plistlib.loads(raw)
                except (ValueError, plistlib.InvalidFileException):
                    tree = ET.fromstring(raw)
                    dictionary = tree.find('dict')
                    if dictionary is None:
                        raise ValueError('Dictionnaire plist absent.')
                    # Some Apple files contain nonstandard nested arrays. Preserve only explicit top-level scalars.
                    nodes = list(dictionary)
                    keys = ('VisibleBuildID', 'FireWireGUID', 'UpdaterFamilyID', 'FamilyID', 'BuildID', 'MinBuildID')
                    for i in range(0, len(nodes) - 1, 2):
                        key, value = nodes[i:i + 2]
                        if key.tag == 'key' and key.text in keys and value.tag in ('string', 'integer'):
                            extended[key.text] = int(value.text) if value.tag == 'integer' else value.text or ''
                    warnings.append('SysInfoExtended non standard : seuls les champs simples utiles au diagnostic ont été lus.')

        except FileNotFoundError:
            warnings.append(name + ' absent : l’identité reste incomplète.')
        except (OSError, ValueError, ET.ParseError, subprocess.SubprocessError):
            warnings.append(name + ' illisible : aucune réparation automatique.')
    return info, json_evidence(extended), warnings


def usb_devices():
    tree = plist(['/usr/sbin/ioreg', '-p', 'IOUSB', '-l', '-a'])
    found = []
    def visit(node):
        if not isinstance(node, dict):
            return
        pid = node.get('idProduct', 0)
        if node.get('idVendor') == 0x05ac and (0x1200 <= pid < 0x1290 or 0x1300 <= pid <= 0x130f):
            mode = 'DFU' if 0x1220 <= pid <= 0x123f else 'WTF / récupération' if pid in (0x1241, 0x1245, 0x1247, 0x1250) else 'USB'
            found.append(dict(product=f'0x{pid:04x}', serial=node.get('USB Serial Number', ''),
                              location=str(node.get('locationID', '')), connection=mode))
        for child in node.get('IORegistryEntryChildren', []):
            visit(child)
    for root in tree:
        visit(root)
    return found


def scan():
    if sys.platform != 'darwin':
        raise RuntimeError('Le diagnostic matériel de cette démo nécessite macOS. Le simulateur est disponible.')
    disks = plist(['/usr/sbin/diskutil', 'list', '-plist', 'external', 'physical'])
    usb = usb_devices()
    found = []
    for entry in disks.get('AllDisksAndPartitions', []):
        whole = plist(['/usr/sbin/diskutil', 'info', '-plist', entry['DeviceIdentifier']])
        if whole.get('Internal', True) or not whole.get('WholeDisk') or whole.get('VirtualOrPhysical') != 'Physical':
            continue
        partitions = [plist(['/usr/sbin/diskutil', 'info', '-plist', p['DeviceIdentifier']]) for p in entry.get('Partitions', [])]
        candidates = []
        for part in partitions:
            mount = part.get('MountPoint', '')
            if mount and (Path(mount) / 'iPod_Control').is_dir():
                candidates.append(part)
        if not candidates and 'ipod' not in whole.get('MediaName', '').lower():
            continue
        part = candidates[0] if len(candidates) == 1 else {}
        mount = part.get('MountPoint', '')
        info, ext, warnings = metadata(mount)
        if len(candidates) > 1:
            warnings.append('Plusieurs volumes iPod : sauvegarde refusée, cible ambiguë.')
        guid = str(ext.get('FireWireGUID', info.get('FirewireGuid', ''))).replace('0x', '').upper()
        matches = [u for u in usb if guid and u['serial'].replace('0x', '').upper() == guid]
        if len(matches) != 1:
            warnings.append('Correspondance disque / USB non établie de façon unique.')
        claim = str(ext.get('VisibleBuildID', ''))
        raw_version = info.get('visibleBuildID', '')
        if not claim:
            match = re.search(r'\(([^)]+)\)', raw_version)
            claim = match.group(1) if match else ''
        if raw_version and claim and claim not in raw_version:
            warnings.append('Les fichiers SysInfo et SysInfoExtended annoncent des versions différentes.')
        identity = dict(tree=whole.get('DeviceTreePath', ''), size=whole.get('TotalSize', 0),
                        guid=guid, serial=info.get('pszSerialNumber', ''), block=whole.get('DeviceBlockSize', 0),
                        partition=part.get('PartitionMapPartitionOffset', -1), volume=part.get('VolumeUUID', ''))
        found.append(dict(id=digest(identity), name=part.get('VolumeName') or 'iPod non monté', mode='hardware',
                          connection='disk', filesystem=part.get('FilesystemName', 'inconnu'), scheme=whole.get('Content', ''),
                          size=whole.get('TotalSize', 0), blockSize=whole.get('DeviceBlockSize', 0),
                          model=info.get('ModelNumStr', 'inconnu'), firmware=claim, family=ext.get('UpdaterFamilyID', 0),
                          identity='unknown', physical='Non déterminé : les identifiants peuvent avoir été modifiés.',
                          evidence=['diskutil : disque externe physique', 'Fichiers montés : identité déclarée, non matérielle',
                                    f'USB : {len(matches)} correspondance(s) par GUID'], warnings=warnings,
                          private=dict(mount=mount, disk=whole, partitions=partitions, usb=matches, info=info, extended=ext)))
    matched = {u['location'] for d in found for u in d['private']['usb']}
    for u in usb:
        if u['location'] in matched:
            continue
        found.append(dict(id=digest(u), name='iPod USB ' + u['product'], mode='hardware', connection=u['connection'],
                          filesystem='non monté', scheme='inconnu', size=0, blockSize=0, model='inconnu', firmware='',
                          family=0, identity='unknown', physical='Non déterminé', evidence=['Descripteur USB Apple'],
                          warnings=['Aucun volume associé : diagnostic USB uniquement.'], private=dict(usb=[u], mount='')))
    return found


def inspect_firmware(path):
    p = Path(path).expanduser().resolve(strict=True)
    if not p.is_file() or p.stat().st_size > 512 * 1024 * 1024:
        raise ValueError('Archive absente ou supérieure à 512 Mo.')
    sha = hashlib.sha256()
    records, seen, total = [], set(), 0
    # One open handle prevents hashing one file and inspecting a replacement.
    with p.open('rb') as f:
        initial = os.fstat(f.fileno())
        for block in iter(lambda: f.read(1024 * 1024), b''):
            sha.update(block)
        f.seek(0)
        with zipfile.ZipFile(f) as archive:
            if len(archive.infolist()) > 256:
                raise ValueError('Trop d’entrées dans l’archive.')
            for item in archive.infolist():
                name = PurePosixPath(item.filename)
                if name.is_absolute() or '..' in name.parts or '\\' in item.filename or item.filename in seen:
                    raise ValueError('Chemin dangereux ou dupliqué dans l’archive.')
                seen.add(item.filename)
                mode = item.external_attr >> 16
                if stat.S_ISLNK(mode) or item.flag_bits & 1:
                    raise ValueError('Lien symbolique ou archive chiffrée refusé.')
                total += item.file_size
                if item.file_size > MAX_IMAGE or total > 512 * 1024 * 1024 or item.file_size > max(1024 * 1024, item.compress_size * 200):
                    raise ValueError('Archive décompressée trop volumineuse.')
                h = hashlib.sha256()
                with archive.open(item) as member:
                    for block in iter(lambda: member.read(1024 * 1024), b''):
                        h.update(block)
                records.append(dict(name=item.filename, size=item.file_size, sha256=h.hexdigest()))
        final = os.fstat(f.fileno())
        if (initial.st_size, initial.st_mtime_ns) != (final.st_size, final.st_mtime_ns):
            raise ValueError('L’archive a changé pendant son contrôle.')
    return dict(name=p.name, sha256=sha.hexdigest(), size=initial.st_size, entries=records, authenticated=False,
                warning='Intégrité ZIP contrôlée. Signature Apple et compatibilité non vérifiées : aucune installation autorisée.')
