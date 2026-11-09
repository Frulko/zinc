import { AuthoringZone } from './templates';

/** Run in Cavalry's JavaScript Editor; only new compositions are modified. */
export function cavalryScript(zones: AuthoringZone[]): string {
  const data = JSON.stringify(zones).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `// Mapper flat guides. Hide the outline layers before rendering your media.
// Run in Cavalry's JavaScript Editor, then save the scene normally.
(function () {
  var zones = ${data};
  if (!zones.length) throw new Error("Mapper: no zones to export.");
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    if (!Number.isFinite(z.width) || !Number.isFinite(z.height) || z.width < 4 || z.height < 4 || z.width > 30000 || z.height > 30000 || Math.floor(z.width) !== z.width || Math.floor(z.height) !== z.height)
      throw new Error("Mapper: invalid composition size for " + z.name);
    for (var m = 0; m < z.masks.length; m++) {
      var points = z.masks[m].points;
      if (points.length < 6 || points.length % 2 !== 0 || points.some(function (n) { return !Number.isFinite(n); }))
        throw new Error("Mapper: invalid mask in " + z.name);
    }
  }
  var previous = api.getActiveComp();
  function outline(zone, name, points, color) {
    var path = new cavalry.Path();
    for (var n = 0; n < points.length; n += 2) {
      var x = (points[n] - 0.5) * zone.width;
      var y = (0.5 - points[n + 1]) * zone.height;
      if (n === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.close();
    var shape = api.createEditable(path, name);
    api.setFill(shape, false);
    api.setStroke(shape, true);
    api.set(shape, {"stroke.strokeColor": color, "stroke.width": 2});
  }
  try {
    for (var j = 0; j < zones.length; j++) {
      var zone = zones[j];
      var comp = api.createComp(zone.name + " — Mapper guides");
      api.setActiveComp(comp);
      api.set(comp, {"resolution.x": zone.width, "resolution.y": zone.height});
      outline(zone, "Zone outline — hide before render", [0, 0, 1, 0, 1, 1, 0, 1], "#ffb020");
      for (var k = 0; k < zone.masks.length; k++) {
        var mask = zone.masks[k];
        outline(zone, "Mask " + (k + 1) + (mask.hideInside ? " — hide inside" : " — show inside"), mask.points, mask.hideInside ? "#ff3c3c" : "#3cff78");
      }
    }
  } finally {
    if (previous) api.setActiveComp(previous);
  }
})();
`;
}
