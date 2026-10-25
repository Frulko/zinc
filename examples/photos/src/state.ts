// The demo's state and its actions: access, the albums, the thumbnails of the chosen album, the picture shown whole. The screens call the
// actions and redraw on onChange; nothing here draws. Runtime images (thumbnails, the whole picture) are destroyed when they leave.
import { destroyImage } from 'zinc:gfx';
import {
  permissionStatus, requestPermission, presentLimitedLibraryPicker, albums, assets, loadThumbnail, loadImage, savePixels,
  Album, Asset, PermissionStatus,
} from 'zinc:photos';
import { generatePicture, PICTURE_SIZE } from './picture';

export const THUMB_SIZE = 200, PAGE = 60, SAVE_ALBUM = 'Zinc';

export class Cell { asset: Asset; image: number; constructor(a: Asset, image: number) { this.asset = a; this.image = image; } }

class State {
  access: PermissionStatus = permissionStatus();
  albums: Album[] = [];
  albumId: string = '';
  cells: Cell[] = [];
  viewing: number = -1;   // the whole picture on screen, -1 for the grid
  message: string = '';
  private request = 0;    // a newer album choice wins over an older one still loading
  private saves = 0;
  private listener: () => void = () => {};

  onChange(f: () => void): void { this.listener = f; }
  private changed(): void { this.listener(); }
  private say(m: string): void { console.log(`photos: ${m}`); this.message = m; this.changed(); }

  start(): void { if (this.access === 'granted' || this.access === 'limited') this.loadAlbums(); }
  ask(): void {
    requestPermission().then((s: PermissionStatus) => { this.access = s; this.say(`access ${s}`); this.start(); });
  }
  changeSelection(): void {
    presentLimitedLibraryPicker().then((shown: boolean) => { if (shown) this.loadAlbums(); });
  }
  loadAlbums(): void {
    albums().then((l: Album[]) => {
      this.albums = l;
      this.say(`${l.length} albums`);
      const keep = l.find((a: Album) => a.id === this.albumId);
      if (l.length > 0) this.choose(keep !== undefined ? keep.id : l[0].id);
    }).catch((e: Error) => this.say(e.message));
  }
  choose(id: string): void {
    const req = ++this.request;
    this.albumId = id;
    for (const c of this.cells) if (c.image >= 0) destroyImage(c.image);
    this.cells = [];
    this.changed();
    assets(id, { limit: PAGE }).then((list: Asset[]) => {
      if (req !== this.request) return;
      this.say(`album ${id}: ${list.length} pictures`);
      this.loadThumbs(req, list, 0);
    }).catch((e: Error) => this.say(e.message));
  }
  // one at a time, so the first rows show at once and a phone is not asked for 60 pictures together
  private loadThumbs(req: number, list: Asset[], i: number): void {
    if (i >= list.length || req !== this.request) return;
    loadThumbnail(list[i].id, THUMB_SIZE).then((img: number) => {
      if (req !== this.request) { destroyImage(img); return; }
      this.cells.push(new Cell(list[i], img));
      this.changed();
      this.loadThumbs(req, list, i + 1);
    }).catch((e: Error) => { console.log(`photos: ${e.message}`); this.loadThumbs(req, list, i + 1); });
  }
  open(c: Cell): void {
    loadImage(c.asset.id).then((img: number) => { this.close(); this.viewing = img; this.say(`showing ${c.asset.id}`); })
      .catch((e: Error) => this.say(e.message));
  }
  close(): void { if (this.viewing >= 0) destroyImage(this.viewing); this.viewing = -1; this.changed(); }
  save(): void {
    savePixels(generatePicture(++this.saves), PICTURE_SIZE, PICTURE_SIZE, SAVE_ALBUM)
      .then((id: string) => { this.say(`saved ${id}`); this.loadAlbums(); })
      .catch((e: Error) => this.say(e.message));
  }
}

export const state = new State();
