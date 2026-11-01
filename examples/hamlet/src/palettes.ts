import { Palette } from './pixel';

// Warm light, cool shadow: these are base colours; the renderer builds the 5-step ramps.
export const SKIN = [219, 176, 139];
export const HAIR_TONES: number[][] = [[111, 94, 68], [72, 58, 46], [168, 128, 78], [54, 48, 44]];
export const SETTLER_PALETTE: Palette = { shirt: [186, 150, 96], stripe: [220, 200, 150], legs: [90, 80, 66], hair: HAIR_TONES[0], skin: SKIN };
export const RESIDENT_PALETTE: Palette = { shirt: [118, 142, 158], stripe: [150, 170, 176], legs: [85, 79, 65], hair: HAIR_TONES[0], skin: SKIN };
export const LUMBERJACK_PALETTE: Palette = { shirt: [174, 84, 62], stripe: [210, 186, 140], legs: [74, 70, 58], hair: HAIR_TONES[0], skin: SKIN };
export const FISHER_PALETTE: Palette = { shirt: [92, 128, 146], stripe: [200, 206, 190], legs: [78, 82, 78], hair: HAIR_TONES[0], skin: SKIN };
export const HUNTER_PALETTE: Palette = { shirt: [96, 116, 76], stripe: [130, 118, 80], legs: [92, 74, 56], hair: HAIR_TONES[0], skin: SKIN };

export const SAWYER_PALETTE: Palette = { shirt: [196, 160, 98], stripe: [230, 214, 170], legs: [96, 78, 62], hair: HAIR_TONES[0], skin: SKIN };
export const SMOKER_PALETTE: Palette = { shirt: [118, 104, 96], stripe: [170, 150, 130], legs: [70, 62, 56], hair: HAIR_TONES[0], skin: SKIN };
export const PORTER_PALETTE: Palette = { shirt: [150, 118, 150], stripe: [206, 184, 200], legs: [86, 76, 70], hair: HAIR_TONES[0], skin: SKIN };
export const FARMER_PALETTE: Palette = { shirt: [200, 176, 92], stripe: [226, 212, 150], legs: [100, 84, 60], hair: HAIR_TONES[0], skin: SKIN };
export const MILLER_PALETTE: Palette = { shirt: [226, 222, 208], stripe: [190, 186, 172], legs: [96, 90, 80], hair: HAIR_TONES[0], skin: SKIN };
export const BAKER_PALETTE: Palette = { shirt: [236, 232, 220], stripe: [196, 120, 90], legs: [92, 84, 76], hair: HAIR_TONES[0], skin: SKIN };
export const VENDOR_PALETTE: Palette = { shirt: [178, 70, 62], stripe: [236, 226, 200], legs: [88, 78, 68], hair: HAIR_TONES[0], skin: SKIN };
export const TANNER_PALETTE: Palette = { shirt: [140, 100, 66], stripe: [188, 150, 104], legs: [66, 56, 48], hair: HAIR_TONES[0], skin: SKIN };
export const QUARRYMAN_PALETTE: Palette = { shirt: [150, 148, 140], stripe: [190, 186, 174], legs: [84, 78, 70], hair: HAIR_TONES[0], skin: SKIN };
export const FORAGER_PALETTE: Palette = { shirt: [92, 134, 84], stripe: [196, 70, 84], legs: [96, 80, 60], hair: HAIR_TONES[0], skin: SKIN };
export const SMITH_PALETTE: Palette = { shirt: [70, 66, 72], stripe: [176, 96, 56], legs: [56, 52, 52], hair: HAIR_TONES[0], skin: SKIN };
export const BEEKEEPER_PALETTE: Palette = { shirt: [236, 232, 214], stripe: [226, 178, 52], legs: [96, 84, 66], hair: HAIR_TONES[0], skin: SKIN };
export const CHANDLER_PALETTE: Palette = { shirt: [214, 188, 132], stripe: [120, 86, 58], legs: [84, 70, 58], hair: HAIR_TONES[0], skin: SKIN };
export const BREWER_PALETTE: Palette = { shirt: [150, 88, 52], stripe: [232, 196, 96], legs: [70, 60, 52], hair: HAIR_TONES[0], skin: SKIN };
export const INNKEEPER_PALETTE: Palette = { shirt: [116, 54, 60], stripe: [236, 226, 200], legs: [66, 58, 54], hair: HAIR_TONES[0], skin: SKIN };
export const FIREWARDEN_PALETTE: Palette = { shirt: [196, 78, 52], stripe: [236, 206, 120], legs: [70, 60, 56], hair: HAIR_TONES[1], skin: SKIN };
export const REPAIRMAN_PALETTE: Palette = { shirt: [176, 140, 84], stripe: [92, 110, 130], legs: [72, 64, 56], hair: HAIR_TONES[2], skin: SKIN };
export const WATCHMAN_PALETTE: Palette = { shirt: [78, 96, 128], stripe: [200, 190, 150], legs: [58, 56, 62], hair: HAIR_TONES[3], skin: SKIN };
export const PEDDLER_PALETTE: Palette = { shirt: [64, 110, 124], stripe: [214, 176, 84], legs: [74, 62, 56], hair: HAIR_TONES[0], skin: SKIN };

export const GRASS_TONES: number[][] = [[53, 78, 49], [76, 100, 52], [104, 124, 63], [138, 150, 85]];
export const WATER_TONES: number[][] = [[43, 99, 103], [58, 119, 114], [75, 137, 122], [99, 154, 133]];
export const SAND_TONES: number[][] = [[196, 180, 132], [210, 194, 146], [222, 206, 160]];
export const ROAD_COLOR = [200, 170, 122];
export const STONE = [222, 208, 172];
export const WOOD_HONEY = [190, 148, 92];
export const WOOD_BROWN = [122, 94, 62];
export const BARK = [96, 76, 58];
export const TERRACOTTA = [176, 104, 76];
export const FUR = [158, 112, 72];
export const FUR_DARK = [120, 84, 56];
export const FUR_LIGHT = [214, 190, 150];

// HUD (screen space)
export const HUD_INK = 0x514b3e;
export const HUD_TEAL = 0x315e5a;
export const HUD_MUTED = 0x8e8270;
export const HUD_PAPER = 0xfff6db;
export const HUD_WARM = 0x74674f;
export const HUD_ALERT = 0xb36d51;
export const HUD_DISABLED = 0xb9ad98;
