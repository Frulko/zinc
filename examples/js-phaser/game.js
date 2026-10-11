// Star catcher, a small game with Phaser 3: steer the boat with the left and right arrows, catch the stars, keep away from the rocks.
// When a rock hits the boat the game stops; the space bar starts it again.
const WIDTH = 320, HEIGHT = 240, BOAT = 0, STAR = 1, ROCK = 2;   // the last three are the frames of assets/sprites.png

class Play extends Phaser.Scene {
  preload() {
    this.load.spritesheet('sprites', 'assets/sprites.png', { frameWidth: 16, frameHeight: 16 });
    this.load.audio('catch', 'assets/catch.wav');
    this.load.audio('crash', 'assets/crash.wav');
  }

  create() {
    this.add.rectangle(WIDTH / 2, HEIGHT - 10, WIDTH, 20, 0x163a5c);   // the sea
    this.boat = this.physics.add.sprite(WIDTH / 2, HEIGHT - 34, 'sprites', BOAT).setScale(2).setCollideWorldBounds(true);
    this.boat.body.setAllowGravity(false);
    this.falling = this.physics.add.group();
    this.physics.add.overlap(this.boat, this.falling, (boat, thing) => this.touch(thing));
    this.time.addEvent({ delay: 500, loop: true, callback: () => this.drop() });

    const style = { fontFamily: 'sans-serif', color: '#ffffff' };
    this.add.text(WIDTH / 2, 8, 'STAR CATCHER', { ...style, fontSize: '16px' }).setOrigin(0.5, 0);
    this.score = 0;
    this.scoreText = this.add.text(8, 8, 'stars: 0', { ...style, fontSize: '14px' });
    this.overText = this.add.text(WIDTH / 2, HEIGHT / 2, '', { ...style, fontSize: '22px', color: '#ff8080' }).setOrigin(0.5);

    this.keys = this.input.keyboard.createCursorKeys();
    this.over = false;
  }

  drop() {   // one more star or rock at the top, somewhere along the width
    const frame = Phaser.Math.RND.frac() < 0.3 ? ROCK : STAR;
    const thing = this.falling.create(Phaser.Math.RND.between(16, WIDTH - 16), -16, 'sprites', frame).setScale(2);
    if (frame === ROCK) thing.setAngularVelocity(120).setCircle(6, 2, 2);
  }

  touch(thing) {
    if (thing.frame.name === ROCK) {
      this.sound.play('crash');
      this.boat.setTint(0xff6666);
      this.physics.pause();
      this.time.removeAllEvents();
      this.over = true;
      this.overText.setText('GAME OVER\nspace to play again').setAlign('center');
      console.log('game over: ' + this.score + ' stars');
    } else {
      this.sound.play('catch');
      thing.destroy();
      this.scoreText.setText('stars: ' + ++this.score);
    }
  }

  update() {
    if (this.over) { if (this.keys.space.isDown) this.scene.restart(); return; }
    this.boat.setVelocityX(this.keys.left.isDown ? -220 : this.keys.right.isDown ? 220 : 0);
    for (const thing of this.falling.getChildren()) if (thing.y > HEIGHT - 16) thing.destroy();   // it fell in the sea
  }
}

new Phaser.Game({
  type: Phaser.WEBGL, width: WIDTH, height: HEIGHT, backgroundColor: '#0b1026', pixelArt: true, banner: false,
  seed: ['zinc'],   // the same stars and rocks at every run
  physics: { default: 'arcade', arcade: { gravity: { y: 150 } } },
  scene: Play,
});
