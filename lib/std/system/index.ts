// zinc:system (core): what every target can answer. The feature modules (zinc:system/tray, ...) are separate imports and need their permission in zinc.json.
export function supports(feature: string): boolean { return false; }
