// The places of the side panel: a name and the view (centre and zoom) to fly to.

export interface Place {
  name: string;
  area: string;
  lat: number;
  lon: number;
  zoom: number;
}

export const PLACES: Place[] = [
  { name: 'Paris', area: 'overview', lat: 48.8566, lon: 2.3522, zoom: 11 },
  { name: 'Notre-Dame', area: '4th', lat: 48.8530, lon: 2.3499, zoom: 15 },
  { name: 'Louvre', area: '1st', lat: 48.8606, lon: 2.3376, zoom: 15 },
  { name: 'Châtelet', area: '1st', lat: 48.8584, lon: 2.3470, zoom: 16 },
  { name: 'Concorde', area: '8th', lat: 48.8656, lon: 2.3212, zoom: 15 },
  { name: 'Place des Vosges', area: '4th', lat: 48.8556, lon: 2.3655, zoom: 16 },
  { name: 'Panthéon', area: '5th', lat: 48.8462, lon: 2.3464, zoom: 15 },
  { name: 'Luxembourg', area: '6th', lat: 48.8462, lon: 2.3372, zoom: 15 },
];
