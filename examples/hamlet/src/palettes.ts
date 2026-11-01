import { Palette } from './pixel';

// Warm light, cool shadow: these are base colours; the renderer builds the 5-step ramps.
export const SKIN = [219, 176, 139];
export const HAIR_TONES: number[][] = [[111, 94, 68], [72, 58, 46], [168, 128, 78], [54, 48, 44]];
export const SETTLER_PALETTE: Palette = { shirt: [186, 150, 96], stripe: [220, 200, 150], legs: [90, 80, 66], hair: HAIR_TONES[0], skin: SKIN };
export const RESIDENT_PALETTE: Palette = { shirt: [118, 142, 158], stripe: [150, 170, 176], legs: [85, 79, 65], hair: HAIR_TONES[0], skin: SKIN };
export const LUMBERJACK_PALETTE: Palette = { shirt: [174, 84, 62], stripe: [210, 186, 140], legs: [74, 70, 58], hair: HAIR_TONES[0], skin: SKIN };
export const FISHER_PALETTE: Palette = { shirt: [92, 128, 146], stripe: [200, 206, 190], legs: [78, 82, 78], hair: HAIR_TONES[0], skin: SKIN };
export const HUNTER_PALETTE: Palette = { shirt: [96, 116, 76], stripe: [130, 118, 80], legs: [92, 74, 56], hair: HAIR_TONES[0], skin: SKIN };

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
