"""Private, durable host-side sessions and an explicitly simulated recovery executor."""
from datetime import datetime, timezone
import hashlib
import json
import os
import platform
import sys
from pathlib import Path
import tempfile
import time
import uuid
import zipfile

from host import read_relative
from model import FAULTS, STEPS


class Session:
    def __init__(self, root, emit):
        root = Path(root).expanduser().resolve()
        # Session writes belong on the host, never on a mounted removable device.
        if root == Path('/') or '/volumes' in str(root).casefold():
            raise ValueError('Les journaux doivent rester sur le disque local du Mac.')
        ancestor = root
        while not ancestor.exists():
            ancestor = ancestor.parent
        if ancestor.stat().st_dev != Path.home().stat().st_dev:
            raise ValueError('Les journaux doivent rester sur le système de fichiers du dossier personnel.')
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = Path(tempfile.mkdtemp(prefix='session-', dir=root))
        self.started = time.monotonic()
        self.emit = emit
        self.sequence = 0
        self.operation = ''
        self.result = dict(status='started', simulated=False)
        self.journal = (self.path / 'events.jsonl').open('a', encoding='utf-8')
        self.event('session', 'Session locale ouverte ; aucune écriture sur un appareil.', backendVersion='0.1.0', python=sys.version.split()[0], platform=platform.platform(), protocol=1)

    def event(self, stage, message, level='info', **detail):
        self.sequence += 1
        event = dict(type='event', sequence=self.sequence, operation=self.operation,
                     utc=datetime.now(timezone.utc).isoformat(), elapsed=round(time.monotonic() - self.started, 3),
                     stage=stage, message=message, level=level, detail=detail)
        self.journal.write(json.dumps(event, ensure_ascii=False) + '\n')
        self.journal.flush()
        os.fsync(self.journal.fileno())
        self.emit(event)

    def write(self, name, data):
        path = self.path / name
        # Names are internal constants, not request paths.
        temporary = path.with_suffix(path.suffix + '.tmp')
        with temporary.open('w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        temporary.replace(path)
        return str(path)

    def begin(self, command):
        self.operation = uuid.uuid4().hex
        self.result = dict(status='running', command=command, operation=self.operation)
        self.write('result.json', self.result)
        self.event(command, 'Opération commencée.')

    def end(self, status, message, **data):
        self.result = dict(status=status, message=message, operation=self.operation, **data)
        self.write('result.json', self.result)
        self.event('result', message, 'error' if status == 'failed' else 'info', status=status, **data)

    def backup(self, device):
        mount = device.get('private', {}).get('mount', '')
        if not mount or os.stat(mount).st_dev == self.path.stat().st_dev:
            raise ValueError('Volume absent ou sauvegarde située sur le même système de fichiers.')
        out = self.path / ('metadata-' + self.operation)
        out.mkdir(mode=0o700)
        incomplete = out / 'INCOMPLETE'
        incomplete.write_text('Backup not verified.\n')
        files, total = [], 0
        names = ('iPod_Control/Device/SysInfo', 'iPod_Control/Device/SysInfoExtended',
                 'iPod_Control/iTunes/iTunesDB', 'iPod_Control/iTunes/iTunesCDB', 'syscfg')
        for name in names:
            try:
                raw = read_relative(mount, name)
            except FileNotFoundError:
                continue
            total += len(raw)
            if total > 256 * 1024 * 1024:
                raise ValueError('Métadonnées supérieures à 256 Mo : sauvegarde incomplète conservée.')
            dest = out / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            with dest.open('xb') as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            sha = hashlib.sha256(raw).hexdigest()
            if hashlib.sha256(dest.read_bytes()).hexdigest() != sha:
                raise ValueError('La relecture de la sauvegarde ne correspond pas.')
            files.append(dict(file=name, bytes=len(raw), sha256=sha))
            self.event('backup', 'Fichier de métadonnées copié et relu.', bytes=len(raw))
        if not files:
            raise ValueError('Aucune métadonnée sauvegardée.')
        manifest = dict(deviceId=device['id'], scope='library-metadata-only', files=files, bytes=total,
                        excludes=['music', 'artwork', 'partition-table', 'disk-firmware', 'live-NOR'],
                        warning='Le fichier syscfg éventuel est une copie non authentifiée, pas une lecture de la NOR.')
        with (out / 'manifest.json').open('x') as f:
            json.dump(manifest, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        return out, incomplete, manifest

    def export(self):
        def public(value):
            if isinstance(value, dict):
                return {k: public(v) for k, v in value.items() if k not in (
                    'private', 'name', 'mount', 'path', 'serial', 'guid', 'location', 'disk', 'partitions', 'info', 'extended')}
            if isinstance(value, list):
                return [public(v) for v in value]
            return value
        output = self.path / ('support-' + uuid.uuid4().hex[:8] + '.zip')
        with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED) as archive:
            for name in ('devices.json', 'firmware.json', 'plan.json', 'result.json'):
                p = self.path / name
                if p.exists():
                    archive.writestr(name, json.dumps(public(json.loads(p.read_text())), indent=2, ensure_ascii=False))
            events = [public(json.loads(line)) for line in (self.path / 'events.jsonl').read_text().splitlines()]
            archive.writestr('events.jsonl', '\n'.join(json.dumps(e, ensure_ascii=False) for e in events) + '\n')
            archive.writestr('README.txt', 'Redacted support bundle. Raw device evidence, backups and firmware binaries excluded.\n')
        return str(output)


def rehearse(session, device, plan, fault='none'):
    if device['mode'] != 'simulation' or not plan['simulated'] or not plan['executable']:
        raise ValueError('Exécution matérielle refusée : transport non qualifié.')
    if fault not in FAULTS:
        raise ValueError('Scénario de panne inconnu.')
    work = session.path / ('rehearsal-' + session.operation)
    work.mkdir(mode=0o700)
    original = b'SIMULATED-SYSCFG-' + device['id'].encode()
    (work / 'syscfg.bin').write_bytes(original)
    original_hash = hashlib.sha256(original).hexdigest()
    payload = b'SIMULATED-FIRMWARE-NOT-FOR-A-DEVICE\0' * 2048
    expected = hashlib.sha256(payload).hexdigest()
    session.write('rehearsal.json', dict(simulated=True, planSha256=plan['sha256'], fault=fault, state='started'))
    for step, title in STEPS:
        session.event(step, title + ' — simulation', simulated=True, state='running')
        time.sleep(0.12)
        if step == 'identify' and fault == 'wrong-target':
            raise ValueError('Identité de la cible différente : arrêt avant toute écriture, sélectionner à nouveau.')
        if step == 'backup':
            (work / 'syscfg.backup').write_bytes(original)
            if hashlib.sha256((work / 'syscfg.backup').read_bytes()).hexdigest() != original_hash:
                raise ValueError('Sauvegarde du SysCFG non vérifiée.')
        if step == 'inputs' and fault == 'wrong-firmware':
            raise ValueError('Firmware incompatible : arrêt avant repartitionnement.')
        if step == 'wtf' and fault == 'disconnect':
            raise ValueError('Déconnexion en récupération : état incertain, reconnecter puis rediagnostiquer. Aucune reprise automatique.')
        if step == 'firmware':
            if fault == 'scsi-error':
                session.event(step, 'SCSI CHECK CONDITION simulé : commande rejetée.', 'error', scsiStatus=2, senseKey=5)
                raise ValueError('Écriture non acquittée : rester en secours, rediagnostiquer avant toute nouvelle tentative.')
            actual = payload[:-4096] if fault == 'short-write' else payload
            (work / 'firmware.bin').write_bytes(actual)
            session.event(step, 'Transfert vers un fichier local de répétition.', simulated=True,
                          expectedBytes=len(payload), actualBytes=len(actual))
            if hashlib.sha256((work / 'firmware.bin').read_bytes()).hexdigest() != expected:
                raise ValueError('Écriture tronquée : empreinte de relecture différente. Ne pas annoncer une restauration réussie.')
        if step == 'format':
            # This model does not pretend to contain a real FAT/HFS implementation.
            (work / 'volume.json').write_text(json.dumps(dict(simulated=True, filesystem=plan['filesystem'],
                logicalBlockSize=device['blockSize'], firmware=device['firmware'], syscfgSha256=original_hash)))
        if step == 'verify':
            if hashlib.sha256((work / 'syscfg.bin').read_bytes()).hexdigest() != original_hash:
                raise ValueError('Identité modifiée : vérification refusée.')
            volume = json.loads((work / 'volume.json').read_text())
            if volume['filesystem'] != plan['filesystem']:
                raise ValueError('Format différent du plan.')
        session.event(step, 'Étape simulée vérifiée.', simulated=True, state='verified')
    session.write('rehearsal.json', dict(simulated=True, planSha256=plan['sha256'], fault=fault, state='verified',
                                       syscfgSha256=original_hash, firmwareSha256=expected))
    return dict(simulated=True, identityPreserved=True, filesystem=plan['filesystem'],
                firmware=device['firmware'], note='Répétition terminée. Aucun formatage ni démarrage matériel effectué.')
