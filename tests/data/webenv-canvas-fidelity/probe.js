// two data: pictures, the second loaded when the first has (the shape of Phaser's blend-mode probe)
const url = document.createElement('canvas').toDataURL();
const first = new Image();
first.onload = () => { const second = new Image(); second.onload = () => { window.probed = true; }; second.src = url; };
first.src = url;
