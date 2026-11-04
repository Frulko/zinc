import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import { setTheme, Theme } from 'zinc:ui/kit';
import { createSignal, createSubtree, Subtree } from 'zinc:ui/solid';
import { Scene } from '../figma-live/scene';
import { BindingEvent } from '../figma-live/native';
import { HomeAssistant, Entity } from './client';
class Row { id: string = ''; label: i32 = -1; state: i32 = -1; }
export class HouseController {
  readonly client: HomeAssistant = new HomeAssistant();
  demo: boolean = true;
  private scene: Scene;
  private ids: string[] = [];
  private roles: Map<string, string> = new Map<string, string>();
  private rows: Map<i32, Row> = new Map<i32, Row>();
  private count: () => number;
  private invalidateRows: () => void;
  private sliderTimer: i32 = 0;
  private sliderValue: number = 72;
  private modal: Subtree | null = null;
  private watcher: () => void;
  private wasDown: boolean = false;
  constructor(scene: Scene) {
    this.scene = scene;
    const [revision,setRevision] = createSignal<number>(0); this.count = (): number => { revision();return this.ids.length; }; this.invalidateRows = (): void => { setRevision(revision()+1); };
    const palette: Theme = {name:'maison',background:'[#f5f4ef]',foreground:'[#203a32]',card:'[#fffefb]',muted:'[#e7eadf]',mutedForeground:'[#7a857c]',border:'[#e9e9e0]',input:'[#e4e7df]',primary:'[#78916a]',primaryForeground:'[#ffffff]',primaryFocus:'[#244d3d]',primaryPressed:'[#244d3d]',secondary:'[#e3e8db]',secondaryForeground:'[#203a32]',secondaryPressed:'[#c3d0b9]',subtle:'[#f0f1e9]',accent:'[#78916a]',accentForeground:'[#ffffff]',accentSoft:'[#e3e8db]',accentSoftForeground:'[#244d3d]',destructive:'[#b54d3e]',destructiveForeground:'[#ffffff]',destructivePressed:'[#92392d]',destructiveSoft:'[#fae6e1]',destructiveSoftForeground:'[#92392d]',success:'[#4f774a]',successSoft:'[#e3e8db]',successSoftForeground:'[#244d3d]',warningSoft:'[#f0e6d3]',warningSoftForeground:'[#846640]'};
    setTheme(palette);
    scene.controls.registerList('house.devices',this.count,(i: i32): i32 => this.deviceRow(i),(h: i32): void => { this.rows.delete(h); });
    scene.onBinding = (e: BindingEvent): boolean => this.handle(e);
    scene.changed = (): void => { this.closeModal(); this.refresh(); };
    scene.onClose = (): void => this.close();
    this.client.changed = (e: Entity): void => this.refreshEntity(e);
    this.client.structure = (): void => this.reindex();
    this.client.statusChanged = (): void => this.refresh();
    this.watcher = (): void => { const down = gfx.pointerDown(); if (this.wasDown && !down) this.refresh(); this.wasDown = down; };
    ui.addWatcher(this.watcher); this.useDemo();
  }
  private textClass(): string { for (const f of this.scene.document.fonts) if (f.family === 'Manrope' && f.style === 'Regular') return 'font-[' + f.name + '] text-sm text-[#203a32]'; return 'text-sm text-[#203a32]'; }
  private add(id: string, name: string, state: string, brightness: number = 0): Entity { const e = new Entity(id);e.name = name;e.state = state;e.attributes['friendly_name'] = name;e.attributes['brightness'] = brightness;this.client.entities.set(id,e);return e; }
  useDemo(): void {
    this.client.disconnect(); this.demo = true; this.client.entities.clear(); this.roles.clear();
    this.add('light.salon','Suspension du salon','on',184);this.add('light.chambre','Lampe de chevet','off');this.add('cover.chambre','Volets de la chambre','closed');
    const climate=this.add('climate.salon','Chauffage du salon','heat');climate.attributes['temperature'] = 21.5;climate.attributes['current_temperature'] = 21.5;
    this.add('sensor.energy_today','Énergie aujourd’hui','4.8').attributes['unit_of_measurement'] = 'kWh';
    this.add('lock.front_door','Porte d’entrée','locked');this.reindex();this.refresh();
  }
  private reindex(): void {
    this.ids = []; for (const e of this.client.entities.values()) this.ids.push(e.id); this.invalidateRows();
    const lights: string[] = [];
    for (const e of this.client.entities.values()) { if(e.domain === 'light')lights.push(e.id);if(e.domain === 'climate'&&!this.roles.has('salon.climate'))this.roles.set('salon.climate',e.id);if(e.domain === 'cover'&&!this.roles.has('chambre.cover'))this.roles.set('chambre.cover',e.id);if(e.text('unit_of_measurement')==='kWh'&&!this.roles.has('energy'))this.roles.set('energy',e.id); }
    if(lights.length>0&&!this.roles.has('salon.light'))this.roles.set('salon.light',lights[0]);if(lights.length>1&&!this.roles.has('chambre.light'))this.roles.set('chambre.light',lights[1]);
    this.refresh();
  }
  private entity(role: string): Entity | null { const id=this.roles.get(role);if(id===undefined)return null;const e=this.client.entities.get(id);return e===undefined?null:e; }
  private control(key: string, value: number, enabled: boolean): void { if(!gfx.pointerDown())this.scene.controls.setValue(key,value);const h=this.scene.outlet(key);if(h>=0){ui.setNumber(h,'disabled',enabled?0:1);ui.setNumber(h,'opacity',enabled?1:.45);} }
  private refreshEntity(e: Entity): void {
    if(this.roles.get('salon.light')===e.id){const value=Math.round(e.numeric('brightness')*100/255);this.control('salon.light',e.state==='on'?1:0,e.available()&&(this.demo||this.client.ready));this.control('salon.brightness',value,e.available()&&(this.demo||this.client.ready));this.scene.setText('salon.brightnessLabel',value+' %');this.scene.setText('salon.lightState',e.available()?e.state==='on'?'Allumée · Blanc chaud':'Éteinte':'Indisponible');this.scene.setText('salon.lightName',e.name);}
    if(this.roles.get('chambre.light')===e.id){this.control('chambre.light',e.state==='on'?1:0,e.available()&&(this.demo||this.client.ready));this.scene.setText('chambre.lightState',e.available()?e.state==='on'?'Allumée':'Éteinte':'Indisponible');this.scene.setText('chambre.lightName',e.name);}
    if(this.roles.get('chambre.cover')===e.id){this.control('chambre.cover',e.state==='open'?1:0,e.available()&&(this.demo||this.client.ready));this.scene.setText('chambre.coverState',e.state==='open'?'Ouverts':e.state==='closed'?'Fermés':e.state);}
    if(this.roles.get('salon.climate')===e.id)this.scene.setText('salon.temperature',e.numeric('temperature',e.numeric('current_temperature',20)).toFixed(1).replace('.',',')+' ');
    if(this.roles.get('energy')===e.id)this.scene.setText('energy.today',e.state.replace('.',',')+' ');
    for(const row of this.rows.values())if(row.id===e.id){ui.setText(row.label,e.name);ui.setText(row.state,this.describe(e));}
  }
  refresh(): void {
    if (this.entity('salon.light')===null) {this.control('salon.light',0,false);this.control('salon.brightness',0,false);this.scene.setText('salon.lightState','Aucune lumière associée');}
    if (this.entity('chambre.light')===null) {this.control('chambre.light',0,false);this.scene.setText('chambre.lightState','Aucune lumière associée');}
    if (this.entity('chambre.cover')===null) this.control('chambre.cover',0,false);
    let security='Sécurité non renseignée';for(const e of this.client.entities.values()){this.refreshEntity(e);if(e.domain==='lock')security=e.name+' · '+(e.available()?e.state:'indisponible');}this.scene.setText('security.state',security);this.scene.setText('security.detail',this.demo?'État simulé':this.client.ready?'État reçu de Home Assistant':'État non confirmé · hors ligne');let active=0;for(const e of this.client.entities.values())if(e.state==='on')active++;this.scene.setText('devices.active',active+' appareils actifs');if(this.entity('energy')===null)this.scene.setText('energy.today','— ');this.scene.setText('connection.status',this.demo?'Mode démo · Maison simulée':this.client.status);this.scene.setText('devices.summary',this.ids.length+' appareils · '+(this.demo?'démonstration':this.client.ready?'états en direct':'hors ligne')); }
  private describe(e: Entity): string { if(!e.available())return 'Indisponible';if(e.domain==='light')return e.state==='on'?'Allumée · '+Math.round(e.numeric('brightness')*100/255)+' %':'Éteinte';if(e.domain==='climate')return e.numeric('temperature',20).toFixed(1).replace('.',',')+' °C';if(e.domain==='cover')return e.state==='open'?'Ouverts':e.state==='closed'?'Fermés':e.state;if(e.domain==='lock')return e.state==='locked'?'Verrouillée':e.state==='unlocked'?'Déverrouillée':e.state;return e.state+(e.text('unit_of_measurement')!==''?' '+e.text('unit_of_measurement'):''); }
  private deviceRow(index: i32): i32 {
    const id=this.ids[index],e=this.client.entities.get(id);if(e===undefined)return ui.createNode(ui.VIEW);
    const h=ui.createNode(ui.VIEW);ui.setClass(h,'w-full h-[72] flex-row items-center px-4 gap-4 bg-[#fffefb] rounded-xl');
    const content=ui.createNode(ui.VIEW);ui.setClass(content,'flex-1 gap-1');const name=ui.createNode(ui.TEXT),state=ui.createNode(ui.TEXT);ui.setClass(name,this.textClass());ui.setClass(state,'text-xs text-[#7a857c]');ui.setText(name,e.name);ui.setText(state,this.describe(e));ui.insert(content,name,-1);ui.insert(content,state,-1);ui.insert(h,content,-1);
    const button=ui.createNode(ui.BUTTON);ui.setClass(button,'h-10 w-[72] items-center justify-center rounded-lg bg-[#e3e8db]');const label=ui.createNode(ui.TEXT);ui.setClass(label,this.textClass());ui.setText(label,'Ouvrir');ui.insert(button,label,-1);ui.setLabel(button,'Ouvrir '+e.name);ui.listen(button,():void=>this.deviceSheet(e as Entity));ui.insert(h,button,-1);
    const row=new Row();row.id=id;row.label=name;row.state=state;this.rows.set(h,row);return h;
  }
  private call(e: Entity, service: string, data: any): void {
    if(this.demo){if(service==='turn_on')e.state='on';if(service==='turn_off')e.state='off';if(service==='open_cover')e.state='open';if(service==='close_cover')e.state='closed';if(typeof data.brightness==='number')e.attributes['brightness'] = data.brightness;if(typeof data.temperature==='number')e.attributes['temperature'] = data.temperature;this.refreshEntity(e);this.activity(e.name+' · '+this.describe(e));return;}
    this.client.command(e,service,data);
  }
  private activity(message: string): void { const h=this.scene.outlet('activity');if(h<0)return;const row=ui.createNode(ui.TEXT);ui.setClass(row,this.textClass()+' w-full py-2');ui.setText(row,message);ui.insert(h,row,-1);while(ui.childCount(h)>40)ui.destroy(ui.childAt(h,0)); }
  handle(event: BindingEvent): boolean {
    const key=event.key;
    if(key==='salon.brightnessChanged'){this.sliderValue=event.value;this.scene.setText('salon.brightnessLabel',Math.round(event.value)+' %');if(this.sliderTimer!==0)clearTimeout(this.sliderTimer);this.sliderTimer=setTimeout(():void=>{this.sliderTimer=0;const e=this.entity('salon.light');if(e!==null)this.call(e,'turn_on',{brightness:Math.round(this.sliderValue*255/100)});},120);return true;}
    for(const role of ['salon.light','chambre.light','chambre.cover'])if(key===role+'Changed'){const e=this.entity(role);if(e!==null)this.call(e as Entity,e.domain==='cover'?event.value!==0?'open_cover':'close_cover':event.value!==0?'turn_on':'turn_off',{});return true;}
    if(key==='climate.increase'||key==='climate.decrease'){const e=this.entity('salon.climate');if(e!==null)this.call(e,'set_temperature',{temperature:Math.max(e.numeric('min_temp',7),Math.min(e.numeric('max_temp',35),e.numeric('temperature',20)+(key==='climate.increase'?.5:-.5)))});return true;}
    if(key==='connection.open'){this.connectionSheet();return true;}
    if(key.startsWith('scene.')){if(this.demo){for(const e of this.client.entities.values())if(e.domain==='light')this.call(e,key==='scene.night'||key==='scene.away'?'turn_off':'turn_on',{});this.activity('Scène '+key.slice(6)+' activée');}else{let found=false;const selected=this.roles.get(key);for(const e of this.client.entities.values())if(e.domain==='scene'&&(selected!==undefined?e.id===selected:e.id.endsWith('.'+key.slice(6)))){this.call(e,'turn_on',{});found=true;}if(!found)this.activity('Associez une scène Home Assistant à '+key.slice(6));}return true;}
    if(key.startsWith('navigate.')){const devices=key==='navigate.devices'||key==='navigate.rooms';for(const s of this.scene.document.screens)if(devices?s.name==='Maison / Devices / Tablet':s.name==='Maison / Overview / Tablet'){this.scene.navigate(s.id);break;}return true;}
    return false;
  }
  private closeModal(): void { if(this.modal!==null){const m=this.modal;this.modal=null;m.dispose();if(ui.inspectNode(m.node)!==null)ui.destroy(m.node);} }
  private sheet(content:()=>i32): void { this.closeModal();this.modal=createSubtree(():i32=><View className="absolute left-0 top-0 w-full h-full bg-black/40 items-center justify-center"><View className="w-[480] max-w-full p-7 gap-4 bg-[#f5f4ef] rounded-2xl">{content()}<Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>this.closeModal()}>Fermer</Button></View></View>);ui.insert(this.scene.root,(this.modal as Subtree).node,-1); }
  private connectionSheet(): void {
    const [address,setAddress]=createSignal<string>('http://homeassistant.local:8123'),[token,setToken]=createSignal<string>(''),[error,setError]=createSignal<string>('');
    this.sheet(():i32=><View className="gap-4"><Text className="text-xl font-bold">Votre Home Assistant</Text><Text className="text-sm text-[#7a857c] whitespace-pre-wrap">Le jeton reste en mémoire. Il n’est écrit ni dans Figma, ni dans les exports.</Text><Input className="h-12 px-3 bg-white border border-[#dfe3d9] rounded-lg" value={address()} onChange={setAddress}/><Input type="password" className="h-12 px-3 bg-white border border-[#dfe3d9] rounded-lg" placeholder="Jeton d’accès personnel" value={token()} onChange={setToken}/><Text className="text-sm text-red-700 whitespace-pre-wrap">{error()}</Text><Button className="h-12 rounded-lg bg-[#244d3d] text-white" onClick={():void=>{try{this.client.connect(address(),token());this.demo=false;this.roles.clear();this.client.entities.clear();this.reindex();setToken('');this.closeModal();this.refresh();}catch(e){setError(e.message);}}}>Se connecter</Button><Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>{this.useDemo();setToken('');this.closeModal();}}>Utiliser le mode démo</Button></View>);
  }
  private assign(role: string, id: string): void { this.roles.set(role,id);this.refresh();this.closeModal(); }
  private deviceSheet(e: Entity): void {
    this.sheet(():i32=><View className="gap-4"><Text className="text-xl font-bold">{e.name}</Text><Text className="text-sm">{e.id+' · '+this.describe(e)}</Text><Show when={e.domain==='light'||e.domain==='cover'}><Button className="h-12 rounded-lg bg-[#244d3d] text-white" onClick={():void=>{this.call(e,e.domain==='cover'?e.state==='open'?'close_cover':'open_cover':e.state==='on'?'turn_off':'turn_on',{});this.closeModal();}}>Changer l’état</Button></Show><Show when={e.domain==='light'}><View className="gap-2"><Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>{this.roles.set('salon.light',e.id);this.refresh();this.closeModal();}}>Associer au contrôle du salon</Button><Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>{this.roles.set('chambre.light',e.id);this.refresh();this.closeModal();}}>Associer au contrôle de la chambre</Button></View></Show><Show when={e.domain==='climate'||e.domain==='cover'||e.text('unit_of_measurement')==='kWh'}><Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>this.assign(e.domain==='climate'?'salon.climate':e.domain==='cover'?'chambre.cover':'energy',e.id)}>Associer au tableau de bord</Button></Show><Show when={e.domain==='scene'}><View className="gap-2">{['morning','evening','night','away'].map((name:string):i32=><Button className="h-11 rounded-lg bg-[#e3e8db]" onClick={():void=>this.assign('scene.'+name,e.id)}>{'Associer à '+name}</Button>)}</View></Show></View>);
  }
  close(): void { this.client.disconnect();if(this.sliderTimer!==0)clearTimeout(this.sliderTimer);this.closeModal();ui.removeWatcher(this.watcher);this.rows.clear(); }
}
