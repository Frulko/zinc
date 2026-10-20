// Phaser 3's GamepadPlugin on the web environment's gamepads (ZN-574): the unmodified phaser.min.js and a scene that listens as Phaser's guide
// writes it (input.gamepad 'connected', 'down' and 'up', then the pad's own fields). Run with ZINC_WEB=1 and phaser.input by
// tests/t1/webenv_gamepad.sh; the output is phaser.out.
const s = document.createElement('script');
s.src = '../../../../third_party/phaser/phaser-3.90.0.min.js';
s.onerror = () => console.log('could not load Phaser');
s.onload = () => {
  let frames = 0;
  new Phaser.Game({
    type: Phaser.WEBGL, width: 320, height: 240, banner: false, audio: { noAudio: true }, input: { gamepad: true },
    scene: {
      create() {
        console.log('create: gamepads', this.input.gamepad.total);
        this.input.gamepad.on('connected', pad => console.log('frame', frames + 1, 'connected', pad.index, JSON.stringify(pad.id), pad.getButtonTotal(), pad.getAxisTotal()));
        this.input.gamepad.on('down', (pad, button, value) => console.log('frame', frames + 1, 'down', button.index, value));
        this.input.gamepad.on('up', (pad, button) => console.log('frame', frames + 1, 'up', button.index));
      },
      update() {
        frames++;
        const pad = this.input.gamepad.pad1;
        if (pad && (frames === 6 || frames === 9)) console.log('frame', frames, 'A', pad.A, 'left', pad.left, 'L2', pad.L2, 'left stick', pad.leftStick.x, pad.leftStick.y);
      },
    },
  });
};
document.head.appendChild(s);
