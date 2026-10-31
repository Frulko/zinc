"""Evidence-based Classic identification. A catalog match never proves an unmodified board."""
import re

# Model/capacity/color facts: libgpod's public device table. See README sources.
CLASSICS = {
    'B029': ('6G · 2007', 80, 'Argent', '1.1.2'),
    'B147': ('6G · 2007', 80, 'Noir', '1.1.2'),
    'B145': ('6G · 2007', 160, 'Argent', '1.1.2'),
    'B150': ('6G · 2007', 160, 'Noir', '1.1.2'),
    'B562': ('6.5G · 2008', 120, 'Argent', '2.0.1'),
    'B565': ('6.5G · 2008', 120, 'Noir', '2.0.1'),
    'C293': ('7G · 2009 / révision ultérieure', 160, 'Argent', ''),
    'C297': ('7G · 2009 / révision ultérieure', 160, 'Noir', ''),
}
SERIAL_MODELS = dict(Y5N='B029', YMV='B147', YMU='B145', YMX='B150',
                     **{'2C5': 'B562', '2C7': 'B565', '9ZS': 'C293', '9ZU': 'C297'})
HARDWARE = {0x130000: '6G · 2007', 0x130100: '6.5G · 2008',
            0x130200: '7G · 2.0.4', 0x130300: '7G · 2.0.5'}


def model_code(value):
    match = re.fullmatch(r'X?M?([BC]\d{3})(?:[A-Z]{0,3}/A)?', str(value).strip().upper())
    return match.group(1) if match else ''


def profile(device, info=None, current=None, reference=None):
    info = info or {}
    code = model_code(device['model'])
    item = CLASSICS.get(code)
    hints = []
    result = dict(typeName='iPod — modèle hors catalogue', generation='Indéterminée',
                  maximum='Indéterminé : identité insuffisante', factoryMaximum='Indéterminé',
                  advice='Ne pas choisir une image sur la seule base des fichiers montés.',
                  status='Non lu', detail='Aucune lecture directe de la NOR. Un appareil cohérent peut avoir un SysCFG modifié.',
                  changed=[], specs=[], fields=[], hints=hints)
    if item:
        generation, capacity, color, last = item
        result.update(typeName='iPod classic', generation=generation,
                      specs=[dict(label='Capacité d’origine', value=f'{capacity} Go (catalogue, pas le stockage actuel)'),
                             dict(label='Couleur d’origine', value=color + ' (identité déclarée)'),
                             dict(label='Écran', value='2,5 pouces · 320 × 240'),
                             dict(label='Connexion', value='Dock 30 broches · USB 2.0'),
                             dict(label='Audio', value='AAC, MP3, Apple Lossless, WAV, AIFF')])
        if last:
            result['factoryMaximum'] = last + ' pour ce modèle d’origine'
            result['maximum'] = last + ' sans modification d’identité'
        else:
            result['factoryMaximum'] = '2.0.4 / 2.0.5 selon révision'
            result['maximum'] = '2.0.4 / 2.0.5 : vérifier la révision SysCFG'
        result['advice'] = 'Conserver la version qui fonctionne. Une version plus récente exige une compatibilité vérifiée.'
        family = device.get('family', 0)
        if code.startswith('C') and family in (35, 38):
            result['maximum'] = ('2.0.4' if family == 35 else '2.0.5') + f' pour la famille déclarée {family}'
        serial_code = SERIAL_MODELS.get(str(info.get('pszSerialNumber', ''))[-3:].upper())
        if serial_code and serial_code != code:
            hints.append('Le suffixe de série et le modèle déclaré désignent des modèles différents.')
        installed = device.get('firmware', '')
        if (last == '1.1.2' and installed.startswith('2.')) or (last == '2.0.1' and installed in ('2.0.2', '2.0.4', '2.0.5')):
            hints.append('Le firmware déclaré dépasse la branche d’origine de ce modèle : conversion possible ou métadonnées incorrectes.')
    if hints:
        result['status'] = 'Incohérences détectées'
        result['detail'] = 'Indices de conversion ou de métadonnées incorrectes ; ce n’est pas une preuve de modification de la NOR.'
    if not current:
        return result
    records = current['records']
    result['fields'] = [dict(label='Source du SysCFG', value='Dump fourni, non lu en direct sur cet iPod'),
                        dict(label='SHA256 du dump', value=current['sha256'][:24] + '…'),
                        dict(label='Mod# du dump', value=current['model']),
                        dict(label='HwVr du dump', value=f"0x{current['hardware']:06x}"),
                        dict(label='SwVr du dump', value=current['software'] + ' (valeur déclarative)'),
                        dict(label='FwId du dump', value=records['FwId'].hex())]
    hardware = current['hardware']
    if code and model_code(current['model']) != code:
        hints.append('Le modèle du dump et celui du volume diffèrent. Le dump peut être ancien ou appartenir à un autre iPod.')
    if item:
        expected = {0x130000} if item[0].startswith('6G') else {0x130100} if item[0].startswith('6.5G') else {0x130200, 0x130300}
        if hardware in HARDWARE and hardware not in expected:
            hints.append('La version matérielle du dump ne correspond pas au modèle déclaré : conversion possible.')
    result['status'] = 'Dump analysé'
    result['detail'] = 'Structure valide ; aucune preuve que ce dump corresponde à la NOR actuelle ou à un état d’usine.'
    if hints:
        result['status'] = 'Incohérences détectées'
    # Identity admission limits are descriptive, never a recommendation to upgrade.
    limits = {0x130000: '1.1.2', 0x130100: '2.0.1', 0x130200: '2.0.4', 0x130300: '2.0.5'}
    if hardware in limits:
        result['maximum'] = limits[hardware] + ' selon HwVr du dump — FwId / révision à vérifier'
    if reference:
        changed = sorted(k for k in records.keys() | reference['records'].keys()
                         if records.get(k) != reference['records'].get(k))
        result['changed'] = changed
        result['status'] = 'Différent de la référence' if changed else 'Champs identiques à la référence'
        result['detail'] = 'Comparaison des champs avec le fichier de référence fourni ; son origine usine n’est pas authentifiée.'
        if not changed and current['sha256'] != reference['sha256']:
            result['detail'] += ' Les fichiers binaires diffèrent hors des champs comparés.'
        source_model = CLASSICS.get(model_code(reference['model']))
        if source_model and records.get('HwId') == reference['records'].get('HwId'):
            result['fields'].append(dict(label='Modèle de référence', value=reference['model'] + ' · ' + source_model[0]))
            if source_model[3]:
                result['factoryMaximum'] = source_model[3] + ' pour le modèle de référence (origine non authentifiée)'
        if records.get('HwId') != reference['records'].get('HwId'):
            hints.append('HwId différent : la référence peut provenir d’un autre appareil. Ne pas l’utiliser pour restaurer l’identité.')
    return result
