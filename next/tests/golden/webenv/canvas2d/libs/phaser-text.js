// Phaser 3 Text objects, as a game writes them (ZN-570): a classic script, the same in the web environment (phaser.js) and in headless Chrome
// (tools/canvas2d-ref, where FAMILY names the bundled Inter). Phaser draws each on a 2D canvas of its own and uploads it as a texture.
new Phaser.Game({
  type: Phaser.WEBGL, width: 320, height: 240, backgroundColor: '#182030', banner: false, audio: { noAudio: true },
  scene: {
    create() {
      const fontFamily = globalThis.FAMILY || 'sans-serif';
      this.add.text(16, 14, 'Phaser Text', { fontFamily, fontSize: '32px', color: '#ffffff' });
      this.add.text(16, 66, 'Score 1250', { fontFamily, fontSize: '26px', fontStyle: 'bold', color: '#ffd24a', stroke: '#102050', strokeThickness: 4 });
      this.add.text(16, 116, 'with a shadow', { fontFamily, fontSize: '22px', color: '#7fe0ff' }).setShadow(3, 3, 'rgba(0, 0, 0, 0.8)', 4);
      this.add.text(16, 160, 'two lines,\ncentred', { fontFamily, fontSize: '16px', color: '#ffffff', align: 'center' });
      this.add.text(304, 226, 'right, bottom', { fontFamily, fontSize: '16px', color: '#ffffff', backgroundColor: '#305080', padding: { x: 6, y: 4 } }).setOrigin(1, 1);
    },
  },
});
