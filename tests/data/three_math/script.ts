import { Script } from 'zinc:script';
import { readText } from 'zinc:fs';

const source = readText('../../../third_party/three/three.core.js');
const probe = "import * as T from 'core'; export function state() { const methods=[['Matrix4','multiplyMatrices'],['Matrix4','compose'],['Matrix4','invert'],['Matrix3','getNormalMatrix'],['Vector3','applyMatrix4'],['Vector4','applyMatrix4'],['Sphere','applyMatrix4'],['Frustum','intersectsSphere'],['Frustum','intersectsObject'],['Quaternion','setFromEuler'],['Object3D','updateMatrix']]; return methods.map(([type,name])=>Number(T[type].prototype[name].toString().includes('[native code]'))).join('')+':'+new T.Matrix4().multiplyMatrices(new T.Matrix4(),new T.Matrix4()).elements[0]; }";
const options = { memoryLimit: 128 << 20, timeLimitMs: 0 };
const imported = new Script(options);
imported.define('core', source);
imported.load('probe', probe);
console.log('script-defined', imported.call('state', []));
imported.dispose();
const direct = new Script(options);
direct.load('core', source);
direct.load('probe', probe);
console.log('script-direct', direct.call('state', []));
direct.dispose();
