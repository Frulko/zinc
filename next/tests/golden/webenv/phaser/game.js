// A Phaser 3 game as its guide writes it: one scene that preloads a picture, shows it beside a turning rectangle and hears the keyboard and the
// pointer. The picture is tests/data/images/fixture.png (32 x 24, twelve flat colours in 8 x 8 blocks), drawn unscaled at 8,8, so the pixels
// read back inside its blocks are the file's own colours; the rectangle is flat red on a flat background: the same numbers on every GPU.
// The pixels are read in Phaser's `postrender` event, in the task that drew them: its context does not preserve the drawing buffer, so a later
// task would read an empty one, as in a browser.
let frames = 0;
const game = new Phaser.Game({
  type: Phaser.WEBGL, width: 320, height: 240, backgroundColor: '#102030', banner: false, audio: { noAudio: true },
  scene: {
    preload() { this.load.image('picture', '../../../data/images/fixture.png'); },
    create() {
      const source = this.textures.get('picture').getSourceImage();
      console.log('create: renderer', this.sys.game.renderer.gl instanceof WebGLRenderingContext ? 'WebGL 1' : 'other', 'canvas', this.sys.game.canvas.width, this.sys.game.canvas.height, this.sys.game.canvas.isConnected,
        'picture', source.width + 'x' + source.height, source instanceof HTMLImageElement);
      this.add.image(8, 8, 'picture').setOrigin(0, 0);
      this.box = this.add.rectangle(160, 120, 80, 80, 0xff0000);
      this.cursors = this.input.keyboard.createCursorKeys();
      this.input.keyboard.on('keydown', e => console.log('frame', frames + 1, 'keydown', e.key, e.keyCode));
      this.input.on('pointerdown', p => console.log('frame', frames + 1, 'pointerdown', Math.round(p.x), Math.round(p.y)));
    },
    update() {
      this.box.rotation += 0.05;
      frames++;
      if (frames === 5 || frames === 7) console.log('frame', frames, 'the left cursor key is down:', this.cursors.left.isDown);
    },
  },
});
game.events.on('postrender', () => {
  if (frames !== 2 && frames !== 8) return;
  const gl = game.renderer.gl, at = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, 239 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p.join(','); };   // x, y from the top left, as the game counts
  console.log('frame', frames, 'rectangle', at(160, 120), 'background', at(300, 220), 'picture: its red block', at(12, 12), 'its olive block', at(36, 28), 'its white block', at(12, 20), 'error', gl.getError());
});
