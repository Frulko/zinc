#!/usr/bin/env python3
"""JSONL recovery service. Read-only hardware; all writes target private host files."""
import argparse
import json
import os
from pathlib import Path
import sys
import traceback

from host import inspect_firmware, scan
from model import plan, sample
from identity import profile
import syscfg
from session import Session, rehearse


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


class Rescue:
    def __init__(self, session):
        self.session = session
        self.devices = []
        self.firmware = None
        self.current_syscfg = None
        self.reference_syscfg = None
        self.syscfg_device = ''

    def selected(self, request):
        matches = [d for d in self.devices if d['id'] == request.get('deviceId')]
        if len(matches) != 1:
            raise ValueError('Sélection absente ou périmée : refaire le diagnostic.')
        return matches[0]

    def handle(self, request):
        command = request.get('command', '')
        if command == 'export':
            output = self.session.export()
            emit(dict(type='artifact', path=output, label='Dossier de support expurgé'))
            self.session.event('export', 'Export créé sans identifiants bruts, sauvegardes ni images firmware.')
            return
        self.session.begin(command)
        if command == 'scan':
            self.devices = []
            self.current_syscfg = None
            self.reference_syscfg = None
            self.syscfg_device = ''
            self.session.write('devices.json', [])
            self.session.write('syscfg.json', dict(status='not-read'))
            mode = request.get('mode', 'hardware')
            if mode not in ('hardware', 'simulation'):
                raise ValueError('Mode inconnu.')
            self.devices = [sample(True), sample(False)] if mode == 'simulation' else scan()
            for device in self.devices:
                self.session.event('identify', 'Preuves de diagnostic collectées.', simulated=mode == 'simulation',
                                   blockSize=device['blockSize'], size=device['size'], model=device['model'],
                                   firmware=device['firmware'], connection=device['connection'], warnings=device['warnings'])
            self.session.write('devices.json', self.devices)
            emit(dict(type='devices', devices=[{k: v for k, v in d.items() if k != 'private'} for d in self.devices]))
            self.session.end('ok', f'Diagnostic terminé : {len(self.devices)} appareil(s).', simulated=mode == 'simulation')
        elif command == 'inspect':
            self.firmware = None
            self.firmware = inspect_firmware(request.get('path', ''))
            self.session.write('firmware.json', self.firmware)
            emit(dict(type='firmware', firmware=self.firmware))
            self.session.end('ok', 'Archive inspectée ; installation matérielle toujours bloquée.', sha256=self.firmware['sha256'],
                             bytes=self.firmware['size'], entries=len(self.firmware['entries']), authenticated=False)
        elif command in ('syscfg', 'reference'):
            device = self.selected(request)
            if command == 'reference' and (self.current_syscfg is None or self.syscfg_device != device['id']):
                raise ValueError('Analyser d’abord le dump courant pour cet appareil.')
            if command == 'syscfg':
                self.current_syscfg = None
                self.reference_syscfg = None
                self.syscfg_device = ''
            else:
                self.reference_syscfg = None
            device['profile'] = profile(device, device.get('private', {}).get('info'), self.current_syscfg)
            self.session.write('devices.json', self.devices)
            emit(dict(type='devices', devices=[{k: v for k, v in d.items() if k != 'private'} for d in self.devices]))
            self.session.write('syscfg.json', dict(deviceId=device['id'], status='awaiting-valid-input'))
            parsed = syscfg.read(request.get('path', ''))
            if command == 'syscfg':
                self.current_syscfg = parsed
                self.reference_syscfg = None
                self.syscfg_device = device['id']
            else:
                self.reference_syscfg = parsed
            device['profile'] = profile(device, device.get('private', {}).get('info'), self.current_syscfg, self.reference_syscfg)
            self.session.write('devices.json', self.devices)
            self.session.write('syscfg.json', dict(deviceId=device['id'], profile=device['profile'],
                               currentSha256=self.current_syscfg['sha256'],
                               referenceSha256=self.reference_syscfg['sha256'] if self.reference_syscfg else ''))
            emit(dict(type='devices', devices=[{k: v for k, v in d.items() if k != 'private'} for d in self.devices]))
            self.session.end('ok', device['profile']['status'] + ' : ' + device['profile']['detail'],
                             changed=device['profile']['changed'])
        elif command == 'plan':
            device = self.selected(request)
            result = plan(device, request.get('filesystem', 'FAT32'), self.firmware)
            self.session.write('plan.json', result)
            emit(dict(type='plan', plan=result))
            self.session.end('ok', 'Plan établi ; identité actuelle conservée.', simulated=result['simulated'])
        elif command == 'backup':
            device = self.selected(request)
            if device['mode'] != 'hardware':
                raise ValueError('Cette sauvegarde concerne un volume réel. La répétition sauvegarde ses propres fichiers fictifs.')
            fresh = [d for d in scan() if d['id'] == device['id']]
            if len(fresh) != 1:
                raise ValueError('Appareil retiré ou identité modifiée avant sauvegarde.')
            out, incomplete, manifest = self.session.backup(fresh[0])
            if len([d for d in scan() if d['id'] == device['id']]) != 1:
                raise ValueError('Appareil modifié pendant la sauvegarde : copie laissée INCOMPLETE.')
            incomplete.unlink()
            emit(dict(type='artifact', path=str(out), label='Métadonnées sauvegardées et relues — musique et NOR exclues'))
            self.session.end('ok', 'Sauvegarde des métadonnées vérifiée ; ce n’est pas une sauvegarde complète.', bytes=manifest['bytes'])
        elif command == 'rehearse':
            device = self.selected(request)
            result = plan(device, request.get('filesystem', 'FAT32'), self.firmware)
            if request.get('confirmation') != 'SIMULER':
                raise ValueError('La répétition doit être confirmée avec SIMULER.')
            self.session.write('plan.json', result)
            emit(dict(type='plan', plan=result))
            outcome = rehearse(self.session, device, result, request.get('fault', 'none'))
            self.session.end('ok', outcome['note'], **outcome)
        else:
            # There is deliberately no raw-device/format/flash escape hatch.
            raise ValueError('Commande refusée : aucune écriture matérielle disponible dans cette démo.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=os.environ.get('IPOD_RESCUE_OUTPUT', str(Path.home() / '.zinc/ipod-rescue')))
    args = parser.parse_args()
    os.umask(0o077)
    session = Session(args.output, emit)
    emit(dict(type='session', path=str(session.path), protocol=1, hardwareWrites=False))
    rescue = Rescue(session)
    for line in sys.stdin:
        try:
            if len(line) > 65536:
                raise ValueError('Requête trop volumineuse.')
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError('Une requête JSON objet est requise.')
            rescue.handle(request)
        except Exception as e:
            # Tracebacks stay private; public errors do not expose arbitrary OS paths/identifiers.
            (session.path / 'private-error.txt').write_text(traceback.format_exc())
            message = str(e) if isinstance(e, ValueError) else 'Erreur du backend : consulter private-error.txt dans la session locale.'
            session.end('failed', message)
            emit(dict(type='error', message=message))
        emit(dict(type='done'))
    session.journal.close()


if __name__ == '__main__':
    main()
