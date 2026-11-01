import { Panel } from './Panel';
import { settings, MINIMAP_CORNERS, MINIMAP_SIZES, LOD_MODES, RESAMPLE_MODES } from '../settings';
import { world } from '../world/world';
import { MIN_SIZE, MAX_SIZE } from '../constants';

/** Builds the live settings panel. `actions` carries what a value needs from the scene (zoom, detail re-bake, new village). */
export interface PanelActions {
  zoom: () => number; setZoom: (step: number) => void; resetView: () => void; refreshModels: () => void;
  mapSize: () => number; setMapSize: (size: number) => void; newMap: () => void;
}

export function buildSettingsPanel(actions: PanelActions): { panel: Panel; fps: number } {
  const panel = new Panel('Réglages');
  panel.folder('Affichage');
  panel.number('Zoom', actions.zoom, actions.setZoom, -5, 5, 1);
  panel.button('Réinitialiser la vue [0]', actions.resetView);
  panel.bool('Pause si on bouge', (): boolean => settings.pauseOnMove, (v: boolean): void => { settings.pauseOnMove = v; });
  panel.bool('Bord défile', (): boolean => settings.edgePan, (v: boolean): void => { settings.edgePan = v; });
  panel.list('Modèles', LOD_MODES, (): number => settings.lod, (v: number): void => { settings.lod = v; actions.refreshModels(); });
  panel.list('Échelle', RESAMPLE_MODES, (): number => settings.resample, (v: number): void => { settings.resample = v; actions.refreshModels(); });
  panel.number('Poses/s', (): number => settings.animFps, (v: number): void => { settings.animFps = v; }, 4, 60, 1);
  panel.number('Vent', (): number => settings.wind, (v: number): void => { settings.wind = v; }, 0, 4, .1);
  panel.bool('Ombres', (): boolean => settings.shadows, (v: boolean): void => { settings.shadows = v; });
  panel.bool('Contours', (): boolean => settings.edges, (v: boolean): void => { settings.edges = v; });
  const fps = panel.monitor('FPS');
  panel.folder('Minimap');
  panel.list('Position', MINIMAP_CORNERS, (): number => settings.minimapCorner, (v: number): void => { settings.minimapCorner = v; });
  panel.list('Pixels', MINIMAP_SIZES, (): number => settings.minimapSize, (v: number): void => { settings.minimapSize = v; });
  panel.bool('Habitants', (): boolean => settings.minimapUnits, (v: boolean): void => { settings.minimapUnits = v; });
  panel.folder('Simulation');
  panel.number('Vitesse', (): number => settings.simSpeed, (v: number): void => { settings.simSpeed = v; }, .25, 6, .25);
  panel.number('Marche', (): number => settings.walkSpeed, (v: number): void => { settings.walkSpeed = v; }, .25, 4, .25);
  panel.bool('Sans limite', (): boolean => world.unlimited, (v: boolean): void => { world.unlimited = v; world.saveDirty = true; });
  panel.number('Arbres min', (): number => settings.treeMin, (v: number): void => { settings.treeMin = v; }, 0, 60, 1);
  panel.number('Repousse (s)', (): number => settings.treeRegrow, (v: number): void => { settings.treeRegrow = v; }, 1, 60, 1);
  panel.number('Cerfs min', (): number => settings.deerMin, (v: number): void => { settings.deerMin = v; }, 0, 16, 1);
  panel.number('Cerfs (s)', (): number => settings.deerRespawn, (v: number): void => { settings.deerRespawn = v; }, 5, 120, 5);
  panel.folder('Monde', false);
  panel.number('Taille grille', actions.mapSize, actions.setMapSize, MIN_SIZE, MAX_SIZE, 2);
  panel.button('Nouvelle carte (même graine)', actions.newMap);
  panel.text('Graine', (): string => String(world.seed));
  panel.text('Taille', (): string => world.size + ' × ' + world.size);
  panel.text('Habitants', (): string => String(world.people.length));
  return { panel, fps };
}
