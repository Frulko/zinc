// Legacy Blinn-Phong approximation, as Assimp's glTF importer: the renderer is not a PBR BRDF.
// https://github.com/assimp/assimp/blob/master/code/AssetLib/glTF2/glTF2Importer.cpp
export function gltfShininess(roughness: number): number {
  const smoothness = 1 - roughness;
  return 1000 * smoothness * smoothness;
}
