import { HomeAssistant, Entity, websocketURL } from '../../../app/maison/client';
function check(ok: boolean, message: string): void { if(!ok)throw new Error(message); }
const client=new HomeAssistant('fixture-secret');const sent:any[]=[];
client.send=(text:string):boolean=>{sent.push(JSON.parse(text));return true;};
client.receive('{"type":"auth_required"}');check(sent[0].type==='auth'&&sent[0].access_token==='fixture-secret','Authentication payload');
client.receive('{"type":"auth_ok"}');check(client.ready&&sent[1].type==='subscribe_entities','Entity subscription');
client.receive('{"type":"event","event":{"a":{"light.salon":{"s":"on","a":{"friendly_name":"Salon","brightness":128,"obsolete":1}},"sensor.temp":{"s":"21","a":{"unit_of_measurement":"°C"}}}}}');
const before=client.entities.get('light.salon') as Entity;check(before.name==='Salon'&&before.numeric('brightness')===128,'Initial state');
client.receive('{"type":"event","event":{"c":{"light.salon":{"+":{"a":{"brightness":200}},"-":{"a":["obsolete"]}}}}}');
check(client.entities.get('light.salon')===before,'Entity identity changed during a delta');check(before.numeric('brightness')===200&&before.attributes.obsolete===undefined,'Compressed attribute merge/removal');
check(client.command(before,'turn_on',{brightness:180}),'Command not sent');const command:any=sent[sent.length-1];check(command.type==='call_service'&&command.target.entity_id==='light.salon'&&command.service_data.brightness===180,'Typed service command');
client.receive('{"type":"result","id":'+command.id+',"success":true}');
client.receive('{"type":"event","event":{"r":["sensor.temp"]}}');check(client.entities.size===1,'Entity removal');
client.receive('{"type":"auth_invalid"}');check(!client.ready&&client.status.indexOf('Jeton refusé')===0,'Authentication failure recovery');
check(websocketURL('https://house.local:8123/hass/')==='wss://house.local:8123/hass/api/websocket','Secure proxy URL');
let rejected=false;try{websocketURL('http://user:pass@house.local');}catch(e){rejected=true;}check(rejected,'Credentials in URL accepted');
client.disconnect();console.log('maison protocol: auth, compact deltas, identity, removals, service calls, failure recovery and URLs ok');
