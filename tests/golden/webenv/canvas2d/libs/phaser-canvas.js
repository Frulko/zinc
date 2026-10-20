// Phaser 3 with type CANVAS (ZN-572): every game object is drawn on the 2D canvas of the document. Sprites of a texture the game draws
// (whole pixels, half pixels, scaled, turned, half transparent), three blend modes, shapes and a text. A classic script, the same in the web
// environment (phasercanvas.js) and in headless Chrome (tools/canvas2d-ref libs phasercanvas).
new Phaser.Game({
  type: Phaser.CANVAS, width: 320, height: 240, backgroundColor: '#182030', banner: false, audio: { noAudio: true },
  scene: {
    create() {
      const fontFamily = globalThis.FAMILY || 'sans-serif';
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xff8800); g.fillCircle(16, 16, 15); g.fillStyle(0x2040ff); g.fillRect(8, 8, 16, 16); g.generateTexture('ball', 32, 32);
      const shapes = this.add.graphics();
      shapes.fillStyle(0x306040); shapes.fillRect(0, 150, 320, 90);
      shapes.fillStyle(0xe0e0e0); shapes.fillRoundedRect(180, 20, 120, 60, 12);
      shapes.lineStyle(4, 0xffd24a); shapes.strokeCircle(240, 50, 22); shapes.lineBetween(10, 140, 310, 140);
      for (let i = 0; i < 5; i++) this.add.image(24 + i * 30, 30, 'ball');
      for (let i = 0; i < 5; i++) this.add.image(24.5 + i * 30, 70.25, 'ball').setAlpha(0.3 + i * 0.15);
      this.add.image(40, 180, 'ball').setScale(2.5);
      this.add.image(110, 180, 'ball').setScale(1.5).setAngle(30);
      this.add.image(170, 180, 'ball').setScale(2).setBlendMode(Phaser.BlendModes.ADD);
      this.add.image(225, 180, 'ball').setScale(2).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.add.image(280, 180, 'ball').setScale(2).setBlendMode(Phaser.BlendModes.SCREEN);
      this.add.image(240, 50, 'ball').setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.add.text(16, 100, 'Phaser CANVAS', { fontFamily, fontSize: '24px', color: '#ffffff' });
    },
  },
});
