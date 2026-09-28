// Not a program to run: scripts/fuzz.sh builds it with --emit=cpp so the plugins' generated native interfaces
// (zinc_native_*.h) and the baked resources (fonts, zinc_resources.cpp) exist for the harnesses in this directory.
import { Svg } from 'zinc:svg';
import * as lottie from 'zinc:lottie';
import * as THREE from 'three';
import { lonToX } from 'zinc:map';
import * as remote from 'zinc:remote';
import 'zinc:devtools';
import * as mapping from 'zinc:mapping';
import { onFrame, drawText } from 'zinc:gfx';

const svg = new Svg('<svg/>');
console.log(svg.width, lottie.parse('{}'), new THREE.Vector3(1, 2, 3).length(), lonToX(1), mapping.layerCount());
remote.stopDiscovery();
onFrame(() => drawText(0, 0, 0, 'x', 0xffffff, 255, 0));
