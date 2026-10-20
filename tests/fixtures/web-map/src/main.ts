// zinc:map on the web target: six offline tiles of Paris in assets/tiles, drawn by MapLibre GL JS behind the plugin's own MapView.
import { MapView } from 'zinc:map';
import { onFrame, clear, width, height } from 'zinc:gfx';

const map = new MapView({ tiles: 'tiles', url: '', cache: '', sourceMinZoom: 10, sourceMaxZoom: 14, style: '' });
map.setView(48.8566, 2.3522, 14);
onFrame((dt: number) => {
  map.update(dt, 0, 0, width(), height());
  clear(0xf2efe9);
  map.draw(0, 0, width(), height());
});
