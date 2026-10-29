// A photo pile, for the demo that shows a card can be anything.
//
// The images come from Lorem Picsum, which serves Unsplash photographs — the id, the author
// and the dimensions below are real. The EXIF is **not**: it is generated from the id so the
// demo is stable, and it is labelled as sample metadata everywhere it is shown. Putting
// invented shutter speeds on someone's photograph and calling it EXIF would be a lie, even in
// a demo.

export interface Photo {
  id: number;
  author: string;
  width: number;
  height: number;
  /** sample EXIF — plausible, deterministic, and not the real thing */
  exif: { camera: string; lens: string; iso: number; shutter: string; aperture: string; date: string; place: string };
  src: string;
  thumb: string;
}

const RAW: Array<[number, string, number, number]> = [
  [24, 'Alejandro Escamilla', 4855, 1803],
  [26, 'Vadim Sherbakov', 4209, 2769],
  [27, 'Yoni Kaplan-Nadel', 3264, 1836],
  [28, 'Jerry Adney', 4928, 3264],
  [29, 'Go Wild', 4000, 2670],
  [31, 'How-Soon Ngu', 3264, 4912],
  [32, 'Rodrigo Melo', 4032, 3024],
  [34, 'Aleks Dorohovich', 3872, 2592],
  [35, 'Shane Colella', 2758, 3622],
  [37, 'Austin Neill', 2000, 1333],
  [39, 'Luke Chesser', 3456, 2304],
  [40, 'Ryan Mcguire', 4106, 2806],
  [43, 'Oleg Chursin', 1280, 831],
  [44, 'Christopher Sardegna', 4272, 2848],
  [45, 'Alan Haverty', 4592, 2576],
  [46, 'Jeffrey Kam', 3264, 2448],
];

const CAMERAS = ['Canon EOS 5D Mk III', 'Nikon D750', 'Fujifilm X-T4', 'Sony α7 III', 'Leica Q2', 'Pentax K-1'];
const LENSES = ['24-70mm f/2.8', '35mm f/1.4', '50mm f/1.8', '85mm f/1.8', '16-35mm f/4', '28mm f/1.7'];
const PLACES = ['Lisbon', 'Reykjavík', 'Kyoto', 'Marseille', 'Oslo', 'Valparaíso', 'Trieste', 'Galway'];
const SHUTTERS = ['1/2000', '1/500', '1/250', '1/125', '1/60', '1/15'];
const APERTURES = ['f/1.8', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11'];
const ISOS = [100, 160, 200, 400, 800, 1600];

export const photos: Photo[] = RAW.map(([id, author, width, height]) => {
  const p = (n: number, list: readonly string[] | readonly number[]) => list[(id * n) % list.length];
  const month = String(((id * 7) % 12) + 1).padStart(2, '0');
  const day = String(((id * 13) % 27) + 1).padStart(2, '0');
  return {
    id,
    author,
    width,
    height,
    exif: {
      camera: p(3, CAMERAS) as string,
      lens: p(5, LENSES) as string,
      iso: p(11, ISOS) as number,
      shutter: p(7, SHUTTERS) as string,
      aperture: p(17, APERTURES) as string,
      date: `202${(id % 5) + 1}-${month}-${day}`,
      place: p(19, PLACES) as string,
    },
    src: `https://picsum.photos/id/${id}/720/900`,
    thumb: `https://picsum.photos/id/${id}/360/450`,
  };
});

export const albums = [
  { id: 'keep', label: 'keep', icon: '★', color: '#f59e0b' },
  { id: 'print', label: 'print', icon: '⎙', color: '#4a54f2' },
  { id: 'edit', label: 'edit', icon: '◐', color: '#8b5cf6' },
  { id: 'archive', label: 'archive', icon: '⌸', color: '#10b981' },
  { id: 'bin', label: 'bin', icon: '␡', color: '#ec4899' },
];

/** What the model looks at: who shot it, with what, when, where. */
export const meta = (p: Photo) => ({
  author: p.author,
  camera: p.exif.camera,
  lens: p.exif.lens,
  place: p.exif.place,
  tag: [p.width > p.height ? 'landscape' : 'portrait', p.exif.iso > 400 ? 'high-iso' : 'low-iso'],
});
