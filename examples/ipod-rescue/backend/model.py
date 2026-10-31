"""Recovery planning shared by the UI, CLI and rehearsals; no device I/O."""
import hashlib
import json

STEPS = [
    ('identify', 'Identifier et verrouiller la cible'),
    ('backup', 'Sauvegarder et vérifier les éléments disponibles'),
    ('inputs', 'Contrôler les images et leur compatibilité'),
    ('dfu', 'Attendre le mode DFU'),
    ('wtf', 'Charger le premier étage de récupération'),
    ('recovery', 'Charger le mode disque de secours'),
    ('firmware', 'Réinstaller le firmware compatible'),
    ('format', 'Recréer le volume de données'),
    ('verify', 'Vérifier le volume et le retour au démarrage'),
]
FAULTS = ('none', 'disconnect', 'wrong-target', 'wrong-firmware', 'short-write', 'scsi-error')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def sample(converted=True):
    return dict(id='sim-converted' if converted else 'sim-stock', name='Classic converti' if converted else 'Classic 6G d’origine',
                mode='simulation', connection='disk', filesystem='FAT32', scheme='MBR',
                size=128_000_000_000, blockSize=4096 if converted else 512,
                model='MC297 (identité déclarée)' if converted else 'MB147',
                firmware='2.0.2' if converted else '1.1.2', family=35 if converted else 24,
                identity='converted' if converted else 'stock', physical='6G / 6.5G non déterminé' if converted else '6G (fixture)',
                evidence=['Appareil fictif : aucun périphérique USB ne sera modifié.',
                          'Le SysCFG actuel sera conservé octet pour octet.'], warnings=[])


def plan(device, filesystem, firmware=None):
    if filesystem not in ('FAT32', 'HFS+'):
        raise ValueError('Format non pris en charge : FAT32 ou HFS+ uniquement.')
    simulated = device['mode'] == 'simulation'
    blockers = []
    if not simulated:
        blockers.append('Transport de restauration matérielle macOS non qualifié : aucune écriture autorisée.')
        blockers.append('Sauvegarde NOR / SysCFG et compatibilité physique non établies.')
        if not firmware or not firmware.get('authenticated', False):
            blockers.append('Authenticité et compatibilité du firmware non vérifiées ; un nom de fichier ne suffit pas.')
    notes = ['Conserver l’identité et le SysCFG actuels ; aucun retour automatique aux paramètres d’usine.',
             'Le formatage efface les données ; il ne garantit pas leur effacement physique sur une mémoire flash.']
    if filesystem == 'HFS+':
        notes.append('HFS+ exclut Rockbox. Le couple matériel / firmware / partitionnement exige une qualification séparée.')
        if not simulated:
            blockers.append('Recette HFS+ de ce modèle non qualifiée.')
    result = dict(deviceId=device['id'], filesystem=filesystem, firmware=device['firmware'] or 'inconnu',
                  preserveIdentity=True, simulated=simulated, executable=simulated,
                  steps=[dict(id=k, title=t) for k, t in STEPS], blockers=blockers, notes=notes,
                  imageSha256=(firmware or {}).get('sha256', ''), blockSize=device['blockSize'])
    result['sha256'] = digest(result)
    return result
