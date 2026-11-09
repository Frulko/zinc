// After Effects gets flat guides: the projector warp remains in Mapper.
import { AuthoringZone } from './templates';

/** A self-contained ExtendScript, run from File > Scripts in After Effects. */
export function afterEffectsScript(zones: AuthoringZone[]): string {
  const data = JSON.stringify(zones).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `// Mapper flat composition guides. Mapping is applied later by Mapper.
(function () {
  var zones = ${data};
  if (!zones.length) { alert("Mapper: no zones to export."); return; }
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    if (!isFinite(z.width) || !isFinite(z.height) || z.width < 4 || z.height < 4 || z.width > 30000 || z.height > 30000 || Math.floor(z.width) !== z.width || Math.floor(z.height) !== z.height) {
      alert("Mapper: invalid composition size for " + z.name + ".");
      return;
    }
  }
  app.beginUndoGroup("Mapper guides");
  try {
    if (!app.project) app.newProject();
    var folder = app.project.items.addFolder("Mapper guides");
    function outline(comp, name, coordinates, color) {
      var layer = comp.layers.addShape();
      layer.name = name;
      layer.guideLayer = true;
      var root = layer.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group");
      var contents = group.property("ADBE Vectors Group");
      var path = contents.addProperty("ADBE Vector Shape - Group");
      var shape = new Shape();
      var vertices = [], inTangents = [], outTangents = [];
      for (var n = 0; n + 1 < coordinates.length; n += 2) {
        vertices.push([coordinates[n] * comp.width - comp.width / 2, coordinates[n + 1] * comp.height - comp.height / 2]);
        inTangents.push([0, 0]); outTangents.push([0, 0]);
      }
      shape.vertices = vertices; shape.inTangents = inTangents; shape.outTangents = outTangents; shape.closed = true;
      path.property("ADBE Vector Shape").setValue(shape);
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(color);
      stroke.property("ADBE Vector Stroke Width").setValue(2);
    }
    for (var j = 0; j < zones.length; j++) {
      var zone = zones[j];
      var comp = app.project.items.addComp(zone.name, zone.width, zone.height, 1, 10, 30);
      comp.parentFolder = folder;
      outline(comp, "Zone outline (guide)", [0, 0, 1, 0, 1, 1, 0, 1], [1, 0.7, 0.13]);
      for (var m = 0; m < zone.masks.length; m++) {
        var mask = zone.masks[m];
        if (mask.points.length >= 6 && mask.points.length % 2 === 0)
          outline(comp, "Mask " + (m + 1) + (mask.hideInside ? " hide inside (guide)" : " show inside (guide)"), mask.points, mask.hideInside ? [1, 0.25, 0.25] : [0.25, 1, 0.5]);
      }
    }
  } finally {
    app.endUndoGroup();
  }
})();
`;
}
