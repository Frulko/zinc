"""Explicit, local component contracts. Figma supplies data, never executable expressions."""
import json
import math
from pathlib import Path

REGISTRY = Path(__file__).with_name('components.json')
KINDS = {'Slider', 'Switch', 'ScrollView', 'VirtualList'}


def contract(component):
    if not isinstance(component, dict): return None
    entries = json.loads(REGISTRY.read_text())['components']
    spec = entries.get(component.get('key', ''))
    if spec is None: return None
    kind = spec['kind']
    if kind not in KINDS: raise ValueError('Unsupported native component: ' + kind)
    if not isinstance(component.get('properties',{}),dict): raise ValueError('Invalid native component properties')
    values = {k.split('#')[0]: v.get('value') for k,v in component.get('properties',{}).items() if isinstance(v,dict)}
    def value(name, default): return values.get(spec.get('properties',{}).get(name,''), default)
    def number(name, default, low=-100000, high=100000):
        try: n = float(value(name, default))
        except (ValueError,TypeError): raise ValueError('Invalid native ' + name)
        if not math.isfinite(n) or not low <= n <= high: raise ValueError('Invalid native ' + name)
        return n
    def boolean(name, default=False):
        v = value(name, default)
        if v is True or str(v).lower() == 'true': return True
        if v is False or str(v).lower() == 'false': return False
        raise ValueError('Invalid native ' + name)
    def binding(group,name):
        v = values.get(spec.get(group,{}).get(name,''), '')
        if not isinstance(v,str) or len(v)>256: raise ValueError('Invalid native binding')
        return v
    out = {'kind':kind,'outlet':binding('inputs','value'),'event':binding('events','change')}
    if kind=='Slider':
        out.update(min=number('min',0),max=number('max',100),step=number('step',1,0),value=number('value',50))
        if out['step']<=0: raise ValueError('Slider step must be positive')
        if out['max']<=out['min']: raise ValueError('Slider max must exceed min')
        out['value']=min(out['max'],max(out['min'],out['value']))
    if kind=='Switch': out['value']=1 if boolean('checked') else 0
    if kind=='ScrollView': out['stickToBottom']=boolean('stickToBottom')
    if kind=='VirtualList':
        out.update(items=binding('inputs','items'),itemHeight=number('itemHeight',72,16,2048),itemKey='id',template=spec.get('template',''))
    return out
