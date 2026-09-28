// Default zinc:map style: OSM-Carto-like colors for the OpenMapTiles schema (OpenFreeMap, MapTiler, Planetiler tiles).
// Mapbox/MapLibre style spec subset, legacy filters; see docs/plugins/map.md for what is supported.
export const OSM_STYLE = `{
  "version": 8,
  "name": "zinc-osm",
  "layers": [
    { "id": "background", "type": "background", "paint": { "background-color": "#f2efe9" } },
    { "id": "landcover-grass", "type": "fill", "source-layer": "landcover", "filter": ["in", "class", "grass", "farmland"], "paint": { "fill-color": "#cdebb0" } },
    { "id": "landcover-wood", "type": "fill", "source-layer": "landcover", "filter": ["==", "class", "wood"], "paint": { "fill-color": "#add19e" } },
    { "id": "landcover-sand", "type": "fill", "source-layer": "landcover", "filter": ["==", "class", "sand"], "paint": { "fill-color": "#f5e9c6" } },
    { "id": "landuse-residential", "type": "fill", "source-layer": "landuse", "filter": ["in", "class", "residential", "suburb", "neighbourhood"], "paint": { "fill-color": "#e0dfdf", "fill-opacity": { "stops": [[10, 0.8], [15, 0.5]] } } },
    { "id": "landuse-commercial", "type": "fill", "source-layer": "landuse", "filter": ["in", "class", "commercial", "retail"], "paint": { "fill-color": "#f2dad9" } },
    { "id": "landuse-industrial", "type": "fill", "source-layer": "landuse", "filter": ["in", "class", "industrial", "railway", "garages"], "paint": { "fill-color": "#ebdbe8" } },
    { "id": "landuse-institution", "type": "fill", "source-layer": "landuse", "filter": ["in", "class", "school", "university", "college", "hospital"], "paint": { "fill-color": "#ffffe5" } },
    { "id": "landuse-cemetery", "type": "fill", "source-layer": "landuse", "filter": ["==", "class", "cemetery"], "paint": { "fill-color": "#aacbaf" } },
    { "id": "landuse-pitch", "type": "fill", "source-layer": "landuse", "filter": ["in", "class", "pitch", "stadium", "playground"], "paint": { "fill-color": "#aae0cb" } },
    { "id": "park", "type": "fill", "source-layer": "park", "filter": ["==", "$type", "Polygon"], "paint": { "fill-color": "#c8facc" } },
    { "id": "water", "type": "fill", "source-layer": "water", "filter": ["==", "$type", "Polygon"], "paint": { "fill-color": "#aad3df" } },
    { "id": "waterway", "type": "line", "source-layer": "waterway", "paint": { "line-color": "#aad3df", "line-width": { "base": 1.3, "stops": [[10, 1], [14, 3], [18, 12]] } } },
    { "id": "aeroway", "type": "line", "source-layer": "aeroway", "minzoom": 11, "filter": ["==", "$type", "LineString"], "paint": { "line-color": "#bbbbcc", "line-width": { "base": 1.4, "stops": [[11, 1], [14, 8], [18, 40]] } } },
    { "id": "building", "type": "fill", "source-layer": "building", "minzoom": 13, "paint": { "fill-color": "#d9d0c9", "fill-outline-color": { "stops": [[14, "rgba(196,182,171,0)"], [15.5, "#c4b6ab"]] } } },

    { "id": "path", "type": "line", "source-layer": "transportation", "minzoom": 15, "filter": ["==", "class", "path"], "paint": { "line-color": "#f29c8f", "line-opacity": 0.7, "line-width": { "stops": [[15, 0.7], [18, 2]] } } },
    { "id": "service-casing", "type": "line", "source-layer": "transportation", "minzoom": 14, "filter": ["in", "class", "service", "track"], "paint": { "line-color": "#c4bcb3", "line-width": { "base": 1.2, "stops": [[14, 2], [18, 12]] } } },
    { "id": "minor-casing", "type": "line", "source-layer": "transportation", "minzoom": 12, "filter": ["==", "class", "minor"], "paint": { "line-color": "#c4bcb3", "line-width": { "base": 1.2, "stops": [[12, 1], [14, 4.5], [18, 20]] } } },
    { "id": "secondary-casing", "type": "line", "source-layer": "transportation", "minzoom": 10, "filter": ["in", "class", "secondary", "tertiary"], "paint": { "line-color": "#b8b38a", "line-width": { "base": 1.2, "stops": [[10, 1], [12, 2.5], [14, 7], [18, 26]] } } },
    { "id": "primary-casing", "type": "line", "source-layer": "transportation", "minzoom": 8, "filter": ["in", "class", "primary", "trunk"], "paint": { "line-color": "#c79a5f", "line-width": { "base": 1.2, "stops": [[8, 1], [10, 2.5], [14, 9], [18, 30]] } } },
    { "id": "motorway-casing", "type": "line", "source-layer": "transportation", "minzoom": 5, "filter": ["==", "class", "motorway"], "paint": { "line-color": "#c24e6b", "line-width": { "base": 1.2, "stops": [[5, 1], [10, 3], [14, 10], [18, 32]] } } },
    { "id": "service", "type": "line", "source-layer": "transportation", "minzoom": 14, "filter": ["in", "class", "service", "track"], "paint": { "line-color": "#ffffff", "line-width": { "base": 1.2, "stops": [[14, 1], [18, 9]] } } },
    { "id": "minor", "type": "line", "source-layer": "transportation", "minzoom": 12, "filter": ["==", "class", "minor"], "paint": { "line-color": "#ffffff", "line-width": { "base": 1.2, "stops": [[12, 0.5], [14, 3], [18, 17]] } } },
    { "id": "secondary", "type": "line", "source-layer": "transportation", "minzoom": 10, "filter": ["in", "class", "secondary", "tertiary"], "paint": { "line-color": "#f7fabf", "line-width": { "base": 1.2, "stops": [[10, 0.5], [12, 1.5], [14, 5], [18, 22]] } } },
    { "id": "primary", "type": "line", "source-layer": "transportation", "minzoom": 8, "filter": ["in", "class", "primary", "trunk"], "paint": { "line-color": "#fcd6a4", "line-width": { "base": 1.2, "stops": [[8, 0.5], [10, 1.5], [14, 7], [18, 26]] } } },
    { "id": "motorway", "type": "line", "source-layer": "transportation", "minzoom": 5, "filter": ["==", "class", "motorway"], "paint": { "line-color": "#e892a2", "line-width": { "base": 1.2, "stops": [[5, 0.5], [10, 2], [14, 8], [18, 28]] } } },
    { "id": "rail", "type": "line", "source-layer": "transportation", "minzoom": 11, "filter": ["all", ["==", "class", "rail"], ["!=", "brunnel", "tunnel"]], "paint": { "line-color": "#999999", "line-width": { "stops": [[11, 0.6], [16, 2]] } } },
    { "id": "boundary", "type": "line", "source-layer": "boundary", "filter": ["all", ["<=", "admin_level", 4], ["!=", "maritime", 1]], "paint": { "line-color": "#9e9cab", "line-width": { "stops": [[3, 0.6], [10, 1.5]] } } },

    { "id": "label-park", "type": "symbol", "source-layer": "park", "minzoom": 14, "layout": { "text-field": "{name}", "text-size": 12 }, "paint": { "text-color": "#2e7d32", "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1 } },
    { "id": "label-water", "type": "symbol", "source-layer": "water_name", "layout": { "text-field": "{name}", "text-size": 14 }, "paint": { "text-color": "#3f6fa0", "text-halo-color": "rgba(255,255,255,0.7)", "text-halo-width": 1 } },
    { "id": "label-neighbourhood", "type": "symbol", "source-layer": "place", "minzoom": 14, "filter": ["in", "class", "neighbourhood", "quarter"], "layout": { "text-field": "{name}", "text-size": 12 }, "paint": { "text-color": "#6a6a6a", "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1 } },
    { "id": "label-suburb", "type": "symbol", "source-layer": "place", "minzoom": 11, "filter": ["==", "class", "suburb"], "layout": { "text-field": "{name}", "text-size": { "stops": [[11, 12], [14, 16]] } }, "paint": { "text-color": "#555555", "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1 } },
    { "id": "label-village", "type": "symbol", "source-layer": "place", "minzoom": 10, "filter": ["in", "class", "village", "hamlet"], "layout": { "text-field": "{name}", "text-size": 12 }, "paint": { "text-color": "#333333", "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1 } },
    { "id": "label-town", "type": "symbol", "source-layer": "place", "filter": ["==", "class", "town"], "layout": { "text-field": "{name}", "text-size": { "stops": [[8, 12], [12, 16]] } }, "paint": { "text-color": "#222222", "text-halo-color": "rgba(255,255,255,0.8)", "text-halo-width": 1 } },
    { "id": "label-city", "type": "symbol", "source-layer": "place", "maxzoom": 14, "filter": ["==", "class", "city"], "layout": { "text-field": "{name}", "text-font": ["Noto Sans Bold"], "text-size": { "stops": [[4, 14], [10, 20]] } }, "paint": { "text-color": "#111111", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.5 } }
  ]
}`;
