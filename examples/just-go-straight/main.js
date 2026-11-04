// Gimond/just-go-straight, ca9acbb8be8482d2e73f92cbc4a381b66b53d9e5 (GPL-3.0).
// Original modules below; only CommonJS packaging is added for standalone loading.
(function () {
const modules = {
"./jsfxr": function (module, exports, require) {
/**
 * SfxrParams
 *
 * Copyright 2010 Thomas Vian
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author Thomas Vian
 */
/** @constructor */
function SfxrParams() {
  //--------------------------------------------------------------------------
  //
  //  Settings String Methods
  //
  //--------------------------------------------------------------------------

  /**
   * Parses a settings array into the parameters
   * @param array Array of the settings values, where elements 0 - 23 are
   *                a: waveType
   *                b: attackTime
   *                c: sustainTime
   *                d: sustainPunch
   *                e: decayTime
   *                f: startFrequency
   *                g: minFrequency
   *                h: slide
   *                i: deltaSlide
   *                j: vibratoDepth
   *                k: vibratoSpeed
   *                l: changeAmount
   *                m: changeSpeed
   *                n: squareDuty
   *                o: dutySweep
   *                p: repeatSpeed
   *                q: phaserOffset
   *                r: phaserSweep
   *                s: lpFilterCutoff
   *                t: lpFilterCutoffSweep
   *                u: lpFilterResonance
   *                v: hpFilterCutoff
   *                w: hpFilterCutoffSweep
   *                x: masterVolume
   * @return If the string successfully parsed
   */
  this.setSettings = function(values)
  {
    for ( var i = 0; i < 24; i++ )
    {
      this[String.fromCharCode( 97 + i )] = values[i] || 0;
    }

    // I moved this here from the reset(true) function
    if (this['c'] < .01) {
      this['c'] = .01;
    }

    var totalTime = this['b'] + this['c'] + this['e'];
    if (totalTime < .18) {
      var multiplier = .18 / totalTime;
      this['b']  *= multiplier;
      this['c'] *= multiplier;
      this['e']   *= multiplier;
    }
  }
}

/**
 * SfxrSynth
 *
 * Copyright 2010 Thomas Vian
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @author Thomas Vian
 */
/** @constructor */
function SfxrSynth() {
  // All variables are kept alive through function closures

  //--------------------------------------------------------------------------
  //
  //  Sound Parameters
  //
  //--------------------------------------------------------------------------

  this._params = new SfxrParams();  // Params instance

  //--------------------------------------------------------------------------
  //
  //  Synth Variables
  //
  //--------------------------------------------------------------------------

  var _envelopeLength0, // Length of the attack stage
    _envelopeLength1, // Length of the sustain stage
    _envelopeLength2, // Length of the decay stage

    _period,          // Period of the wave
    _maxPeriod,       // Maximum period before sound stops (from minFrequency)

    _slide,           // Note slide
    _deltaSlide,      // Change in slide

    _changeAmount,    // Amount to change the note by
    _changeTime,      // Counter for the note change
    _changeLimit,     // Once the time reaches this limit, the note changes

    _squareDuty,      // Offset of center switching point in the square wave
    _dutySweep;       // Amount to change the duty by

  //--------------------------------------------------------------------------
  //
  //  Synth Methods
  //
  //--------------------------------------------------------------------------

  /**
   * Resets the runing variables from the params
   * Used once at the start (total reset) and for the repeat effect (partial reset)
   */
  this.reset = function() {
    // Shorter reference
    var p = this._params;

    _period       = 100 / (p['f'] * p['f'] + .001);
    _maxPeriod    = 100 / (p['g']   * p['g']   + .001);

    _slide        = 1 - p['h'] * p['h'] * p['h'] * .01;
    _deltaSlide   = -p['i'] * p['i'] * p['i'] * .000001;

    if (!p['a']) {
      _squareDuty = .5 - p['n'] / 2;
      _dutySweep  = -p['o'] * .00005;
    }

    _changeAmount =  1 + p['l'] * p['l'] * (p['l'] > 0 ? -.9 : 10);
    _changeTime   = 0;
    _changeLimit  = p['m'] == 1 ? 0 : (1 - p['m']) * (1 - p['m']) * 20000 + 32;
  }

  // I split the reset() function into two functions for better readability
  this.totalReset = function() {
    this.reset();

    // Shorter reference
    var p = this._params;

    // Calculating the length is all that remained here, everything else moved somewhere
    _envelopeLength0 = p['b']  * p['b']  * 100000;
    _envelopeLength1 = p['c'] * p['c'] * 100000;
    _envelopeLength2 = p['e']   * p['e']   * 100000 + 12;
    // Full length of the volume envelop (and therefore sound)
    // Make sure the length can be divided by 3 so we will not need the padding "==" after base64 encode
    return ((_envelopeLength0 + _envelopeLength1 + _envelopeLength2) / 3 | 0) * 3;
  }

  /**
   * Writes the wave to the supplied buffer ByteArray
   * @param buffer A ByteArray to write the wave to
   * @return If the wave is finished
   */
  this.synthWave = function(buffer, length) {
    // Shorter reference
    var p = this._params;

    // If the filters are active
    var _filters = p['s'] != 1 || p['v'],
      // Cutoff multiplier which adjusts the amount the wave position can move
      _hpFilterCutoff = p['v'] * p['v'] * .1,
      // Speed of the high-pass cutoff multiplier
      _hpFilterDeltaCutoff = 1 + p['w'] * .0003,
      // Cutoff multiplier which adjusts the amount the wave position can move
      _lpFilterCutoff = p['s'] * p['s'] * p['s'] * .1,
      // Speed of the low-pass cutoff multiplier
      _lpFilterDeltaCutoff = 1 + p['t'] * .0001,
      // If the low pass filter is active
      _lpFilterOn = p['s'] != 1,
      // masterVolume * masterVolume (for quick calculations)
      _masterVolume = p['x'] * p['x'],
      // Minimum frequency before stopping
      _minFreqency = p['g'],
      // If the phaser is active
      _phaser = p['q'] || p['r'],
      // Change in phase offset
      _phaserDeltaOffset = p['r'] * p['r'] * p['r'] * .2,
      // Phase offset for phaser effect
      _phaserOffset = p['q'] * p['q'] * (p['q'] < 0 ? -1020 : 1020),
      // Once the time reaches this limit, some of the    iables are reset
      _repeatLimit = p['p'] ? ((1 - p['p']) * (1 - p['p']) * 20000 | 0) + 32 : 0,
      // The punch factor (louder at begining of sustain)
      _sustainPunch = p['d'],
      // Amount to change the period of the wave by at the peak of the vibrato wave
      _vibratoAmplitude = p['j'] / 2,
      // Speed at which the vibrato phase moves
      _vibratoSpeed = p['k'] * p['k'] * .01,
      // The type of wave to generate
      _waveType = p['a'];

    var _envelopeLength      = _envelopeLength0,     // Length of the current envelope stage
      _envelopeOverLength0 = 1 / _envelopeLength0, // (for quick calculations)
      _envelopeOverLength1 = 1 / _envelopeLength1, // (for quick calculations)
      _envelopeOverLength2 = 1 / _envelopeLength2; // (for quick calculations)

    // Damping muliplier which restricts how fast the wave position can move
    var _lpFilterDamping = 5 / (1 + p['u'] * p['u'] * 20) * (.01 + _lpFilterCutoff);
    if (_lpFilterDamping > .8) {
      _lpFilterDamping = .8;
    }
    _lpFilterDamping = 1 - _lpFilterDamping;

    var _finished = false,     // If the sound has finished
      _envelopeStage    = 0, // Current stage of the envelope (attack, sustain, decay, end)
      _envelopeTime     = 0, // Current time through current enelope stage
      _envelopeVolume   = 0, // Current volume of the envelope
      _hpFilterPos      = 0, // Adjusted wave position after high-pass filter
      _lpFilterDeltaPos = 0, // Change in low-pass wave position, as allowed by the cutoff and damping
      _lpFilterOldPos,       // Previous low-pass wave position
      _lpFilterPos      = 0, // Adjusted wave position after low-pass filter
      _periodTemp,           // Period modified by vibrato
      _phase            = 0, // Phase through the wave
      _phaserInt,            // Integer phaser offset, for bit maths
      _phaserPos        = 0, // Position through the phaser buffer
      _pos,                  // Phase expresed as a Number from 0-1, used for fast sin approx
      _repeatTime       = 0, // Counter for the repeats
      _sample,               // Sub-sample calculated 8 times per actual sample, averaged out to get the super sample
      _superSample,          // Actual sample writen to the wave
      _vibratoPhase     = 0; // Phase through the vibrato sine wave

    // Buffer of wave values used to create the out of phase second wave
    var _phaserBuffer = new Array(1024),
      // Buffer of random values used to generate noise
      _noiseBuffer  = new Array(32);
    for (var i = _phaserBuffer.length; i--; ) {
      _phaserBuffer[i] = 0;
    }
    for (var i = _noiseBuffer.length; i--; ) {
      _noiseBuffer[i] = Math.random() * 2 - 1;
    }

    for (var i = 0; i < length; i++) {
      if (_finished) {
        return i;
      }

      // Repeats every _repeatLimit times, partially resetting the sound parameters
      if (_repeatLimit) {
        if (++_repeatTime >= _repeatLimit) {
          _repeatTime = 0;
          this.reset();
        }
      }

      // If _changeLimit is reached, shifts the pitch
      if (_changeLimit) {
        if (++_changeTime >= _changeLimit) {
          _changeLimit = 0;
          _period *= _changeAmount;
        }
      }

      // Acccelerate and apply slide
      _slide += _deltaSlide;
      _period *= _slide;

      // Checks for frequency getting too low, and stops the sound if a minFrequency was set
      if (_period > _maxPeriod) {
        _period = _maxPeriod;
        if (_minFreqency > 0) {
          _finished = true;
        }
      }

      _periodTemp = _period;

      // Applies the vibrato effect
      if (_vibratoAmplitude > 0) {
        _vibratoPhase += _vibratoSpeed;
        _periodTemp *= 1 + Math.sin(_vibratoPhase) * _vibratoAmplitude;
      }

      _periodTemp |= 0;
      if (_periodTemp < 8) {
        _periodTemp = 8;
      }

      // Sweeps the square duty
      if (!_waveType) {
        _squareDuty += _dutySweep;
        if (_squareDuty < 0) {
          _squareDuty = 0;
        } else if (_squareDuty > .5) {
          _squareDuty = .5;
        }
      }

      // Moves through the different stages of the volume envelope
      if (++_envelopeTime > _envelopeLength) {
        _envelopeTime = 0;

        switch (++_envelopeStage)  {
          case 1:
            _envelopeLength = _envelopeLength1;
            break;
          case 2:
            _envelopeLength = _envelopeLength2;
        }
      }

      // Sets the volume based on the position in the envelope
      switch (_envelopeStage) {
        case 0:
          _envelopeVolume = _envelopeTime * _envelopeOverLength0;
          break;
        case 1:
          _envelopeVolume = 1 + (1 - _envelopeTime * _envelopeOverLength1) * 2 * _sustainPunch;
          break;
        case 2:
          _envelopeVolume = 1 - _envelopeTime * _envelopeOverLength2;
          break;
        case 3:
          _envelopeVolume = 0;
          _finished = true;
      }

      // Moves the phaser offset
      if (_phaser) {
        _phaserOffset += _phaserDeltaOffset;
        _phaserInt = _phaserOffset | 0;
        if (_phaserInt < 0) {
          _phaserInt = -_phaserInt;
        } else if (_phaserInt > 1023) {
          _phaserInt = 1023;
        }
      }

      // Moves the high-pass filter cutoff
      if (_filters && _hpFilterDeltaCutoff) {
        _hpFilterCutoff *= _hpFilterDeltaCutoff;
        if (_hpFilterCutoff < .00001) {
          _hpFilterCutoff = .00001;
        } else if (_hpFilterCutoff > .1) {
          _hpFilterCutoff = .1;
        }
      }

      _superSample = 0;
      for (var j = 8; j--; ) {
        // Cycles through the period
        _phase++;
        if (_phase >= _periodTemp) {
          _phase %= _periodTemp;

          // Generates new random noise for this period
          if (_waveType == 3) {
            for (var n = _noiseBuffer.length; n--; ) {
              _noiseBuffer[n] = Math.random() * 2 - 1;
            }
          }
        }

        // Gets the sample from the oscillator
        switch (_waveType) {
          case 0: // Square wave
            _sample = ((_phase / _periodTemp) < _squareDuty) ? .5 : -.5;
            break;
          case 1: // Saw wave
            _sample = 1 - _phase / _periodTemp * 2;
            break;
          case 2: // Sine wave (fast and accurate approx)
            _pos = _phase / _periodTemp;
            _pos = (_pos > .5 ? _pos - 1 : _pos) * 6.28318531;
            _sample = 1.27323954 * _pos + .405284735 * _pos * _pos * (_pos < 0 ? 1 : -1);
            _sample = .225 * ((_sample < 0 ? -1 : 1) * _sample * _sample  - _sample) + _sample;
            break;
          case 3: // Noise
            _sample = _noiseBuffer[Math.abs(_phase * 32 / _periodTemp | 0)];
        }

        // Applies the low and high pass filters
        if (_filters) {
          _lpFilterOldPos = _lpFilterPos;
          _lpFilterCutoff *= _lpFilterDeltaCutoff;
          if (_lpFilterCutoff < 0) {
            _lpFilterCutoff = 0;
          } else if (_lpFilterCutoff > .1) {
            _lpFilterCutoff = .1;
          }

          if (_lpFilterOn) {
            _lpFilterDeltaPos += (_sample - _lpFilterPos) * _lpFilterCutoff;
            _lpFilterDeltaPos *= _lpFilterDamping;
          } else {
            _lpFilterPos = _sample;
            _lpFilterDeltaPos = 0;
          }

          _lpFilterPos += _lpFilterDeltaPos;

          _hpFilterPos += _lpFilterPos - _lpFilterOldPos;
          _hpFilterPos *= 1 - _hpFilterCutoff;
          _sample = _hpFilterPos;
        }

        // Applies the phaser effect
        if (_phaser) {
          _phaserBuffer[_phaserPos % 1024] = _sample;
          _sample += _phaserBuffer[(_phaserPos - _phaserInt + 1024) % 1024];
          _phaserPos++;
        }

        _superSample += _sample;
      }

      // Averages out the super samples and applies volumes
      _superSample *= .125 * _envelopeVolume * _masterVolume;

      // Clipping if too loud
      buffer[i] = _superSample >= 1 ? 32767 : _superSample <= -1 ? -32768 : _superSample * 32767 | 0;
    }

    return length;
  }
}

// Adapted from http://codebase.es/riffwave/
var synth = new SfxrSynth();
// Export for the Closure Compiler
module.exports = {
  init: function (settings) {
    // Initialize SfxrParams
    synth._params.setSettings(settings);
    // Synthesize Wave
    var envelopeFullLength = synth.totalReset();
    var data = new Uint8Array(((envelopeFullLength + 1) / 2 | 0) * 4 + 44);
    var used = synth.synthWave(new Uint16Array(data.buffer, 44), envelopeFullLength) * 2;
    var dv = new Uint32Array(data.buffer, 0, 44);
    // Initialize header
    dv[0] = 0x46464952; // "RIFF"
    dv[1] = used + 36;  // put total size here
    dv[2] = 0x45564157; // "WAVE"
    dv[3] = 0x20746D66; // "fmt "
    dv[4] = 0x00000010; // size of the following
    dv[5] = 0x00010001; // Mono: 1 channel, PCM format
    dv[6] = 0x0000AC44; // 44,100 samples per second
    dv[7] = 0x00015888; // byte rate: two bytes per sample
    dv[8] = 0x00100002; // 16 bits per sample, aligned on every two bytes
    dv[9] = 0x61746164; // "data"
    dv[10] = used;      // put number of samples here

    // Base64 encoding written by me, @maettig
    used += 44;
    var i = 0,
      base64Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
      output = 'data:audio/wav;base64,';
    for (; i < used; i += 3) {
      var a = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
      output += base64Characters[a >> 18] + base64Characters[a >> 12 & 63] + base64Characters[a >> 6 & 63] + base64Characters[a & 63];
    }
    return output;
  }
}

},
"./loop": function (module, exports, require) {
var lastTime = timestamp();
var stats;

// if (!PRODUCTION) {
//   stats = require('stats.js')(0);
//   document.body.appendChild(stats.dom);
// }

function timestamp () {
  return window.performance && window.performance.now ?
    window.performance.now() :
    Date.now();
}

function raf (fn) {
  return window.requestAnimationFrame(function () {
    stats && stats.begin();

    var now = timestamp();
    var dt = now - lastTime;

    if (dt > 999) {
      dt = 1 / 60;
    } else {
      dt /= 1000;
    }

    lastTime = now;

    fn(dt);

    stats && stats.end();
  });
}

exports.start = function (fn) {
  return raf(function tick (dt) {
    fn(dt);
    raf(tick);
  });
};

},
"./key": function (module, exports, require) {
var _pressed = {};
var key = {};

key.LEFT = 37;
key.UP = 38;
key.RIGHT = 39;
key.DOWN = 40;
key.ENTER = 13;

key.isDown = function (keyCode) {
  return _pressed[keyCode];
};

key.onKeydown = function (event) {
  _pressed[event.keyCode] = true;
};

key.onKeyup = function  (event) {
  _pressed[event.keyCode] = null;
};

window.addEventListener('keyup', function (e) {
  key.onKeyup(e);
}, false);
window.addEventListener('keydown', function (e) {
  key.onKeydown(e);
}, false);

module.exports = key;

},
"./main": function (module, exports, require) {
var jsfxr = require('./jsfxr');
var loop = require('./loop');
var key = require('./key');

(function(){
  function rand_int(max) {
    return Math.random() * (max || 0xfffffff) | 0;
  }
  function rand_range(min, max) {
    return rand_int(max - min) + min;
  }

  var canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  canvas.style.backgroundColor = '#000';
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;

  var mob = {};
  var beach = {};
  var jungle = {};
  var jungle_save = [];
  var jungle_saved_index = -1;
  init();

  var sounds = {
    pickup: [0,,0.0247,0.3763,0.2638,0.8004,,,,,,0.4915,0.5263,,,,,,1,,,,,0.5],
    screen_change: [0,,0.1223,,0.2985,0.4522,,0.2578,,,,,,0.2074,,,,,0.8619,,,,,0.5],
    win: [0,,0.42,,0.61,0.4823,0.3,0.28,0.08,,,,,0.5228,,0.4983,,,1,,,,,0.5],
    empty: [1,,0.27,,0.59,0.45,,-0.2325,,,,,,0.0266,0.1374,,,,1,,,,,0.5],
    step: [1,,0.0284,,0.1618,0.397,,-0.6104,,,,,,,,,,,1,,,0.2436,,0.5],
    hit: [3,,0.0833,,0.1303,0.3802,,-0.4149,,,,,,,,,,,1,,,0.1488,,0.5],
    wave: [3,0.56,0.39,,0.85,0.41,,0.26,0.12,,,0.08,,,,,,,0.4,,,,-0.26,0.5]
  };
  Object.keys(sounds).map(function(objectKey, index) {
    var soundURL = jsfxr.init(sounds[objectKey]);
    sounds[objectKey] = new Audio();
    sounds[objectKey].src = soundURL;
  });

  var beach_bg = new Image();
  beach_bg.src = 'b.png';

  var pirate = new Image();
  pirate.src = 'p.png';

  var treasure = new Image();
  treasure.src = 't.png';

  var jungle_sprite = new Image();
  jungle_sprite.src = 'j.png';

  var jungle_sprite_b = new Image();
  jungle_sprite_b.src = 'k.png';

  var items_sprite = new Image();
  items_sprite.src = 'i.png';

  var wave = new Image();
  wave.src = 'w.png';

  // 0 = cheater
  // 1 = lose
  // 2 = forgot shovel
  // 3 = win
  var endings = [false, false, false, false];
  // var endings = [true, true, true, true];
  var game_complete = false;

  var timer = 0;
  var timer_step = 0;
  var timer_eyes = 0;
  var timer_anim_win = 0;
  var timer_wave = 2;
  var timeout_game_complete = 1;
  // var secret_path = [1,3,0,1,0,2,3,0,2,1,1,0,3,2,0,1,3,3,3,1,2,0];
  var cheat_path = [0,0,2,2,3,1,3,1];

  // game loop
  loop.start(function (dt) {
    timer+= dt;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mob.end > -1 && key.isDown(key.ENTER) && (endings[0] && endings[1] && endings[2] && endings[3]) && !game_complete) {
      sounds['win'].play();
      game_complete = true;
    }
    if (mob.end > -1 && key.isDown(key.ENTER) && (!game_complete || timeout_game_complete <= 0)) {
      if (game_complete) {
        game_complete = false;
        endings = [false, false, false, false];
      }
      init();
      sounds['screen_change'].play();
    }

    mob.prev_x = mob.x;
    mob.prev_y = mob.y;

    // update mob
    mob.moving = false;
    if (!mob.win && !mob.back_to_beach) {
      if (key.isDown(key.UP)) {
        mob.y = mob.y - (300 * dt);
        mob.dir = 0;
        mob.moving = true;
        check_collisions();
      }
      if (key.isDown(key.RIGHT)) {
        mob.x = mob.x + (300 * dt);
        mob.dir = 1;
        mob.moving = true;
        check_collisions();
      }
      if (key.isDown(key.DOWN)) {
        mob.y = mob.y + (300 * dt);
        mob.dir = 2;
        mob.moving = true;
        check_collisions();
      }
      if (key.isDown(key.LEFT)) {
        mob.x = mob.x - (300 * dt);
        mob.dir = 3;
        mob.moving = true;
        check_collisions();
      }
    }
    if (mob.back_to_beach) {
      if (mob.x > 550) {
        mob.x = mob.x - (100 * dt);
        mob.dir = 3;
        mob.moving = true;
      } else {
        mob.back_to_beach = false;
      }
    }

    // check bounds collisions
    if (mob.x < 10) {
      mob.x = canvas.width-10;
      lost(3);
      generate_jungle(3);
    } else if (mob.x > canvas.width - 10) {
      mob.x = 10;
      mob.beach = false;

      if (!mob.lost) {
        mob.straight_count++;

        if (mob.straight_count > 5) {
          mob.win = true;
          mob.x = 10;
          mob.y = 320;
        }
      } else {
        lost(1);
      }
      generate_jungle(1);
    }
    if (mob.y < 236) {
      mob.x = 278;
      mob.y = canvas.height-10;
      lost(0);
      generate_jungle(0);
    } else if (mob.y > canvas.height-10) {
      mob.x = 378;
      mob.y = 240;
      lost(2);
      generate_jungle(2);
    }

    if (mob.beach) {
      // draw beach
      ctx.drawImage(beach_bg, 0, 0, canvas.width, canvas.height);
      if (timer_wave > 3) {
        ctx.drawImage(wave, 136, 360, 504, 72);
      }
      if (timer_wave > 5) {
        timer_wave = 0;
        sounds['wave'].play();
      }
      timer_wave+= dt;
    } else if (mob.win) {
      // draw end screen
      ctx.drawImage(treasure, 0, 0, canvas.width, canvas.height);

      if (mob.never_lost && (mob.shovel || mob.end_shovel > 0)) {
        mob.walk_to = 316;

        if (mob.x >= 240) {
          // shovel ready
          mob.shovel = false;
          mob.end_shovel = 1;
        }
        if (mob.x >= mob.walk_to) {
          timer_anim_win+= dt;

          if (timer_anim_win > 0.5) {
            // shovel down
            if (!mob.dug) {
              sounds['hit'].play();
              mob.dug = true;
            }
            mob.end_shovel = 2;
          }
          if (timer_anim_win > 1) {
            ctx.drawImage(items_sprite, 65, 0, 40, 28, 248, 236, 160, 112);
            ctx.drawImage(items_sprite, 10, 5, 22, 19, 280, 264, 88, 76);
            if (mob.y != 236) {
              jungle.steps.splice(jungle.steps.length - 5);
              mob.y = 236;
            }
          }
          if (timer_anim_win > 1.5) {
            mob.dir = 2;
            mob.end_shovel = 0;
            mob.shovel = true;

            if (mob.cheated) {
              sounds['win'].play();
              mob.end = 0;
              mob.cheated = false;
            }
            if (mob.end == -1) {
              sounds['win'].play();
              mob.end = 3;
            }
          }
        }
        if (mob.x >= 150 && mob.sword) {
          sounds['hit'].play();
          mob.sword = false;
          mob.end_sword = true;
        }
      }
      if (!mob.never_lost) {
        mob.walk_to = 200;
        // empty chest
        ctx.drawImage(items_sprite, 65, 0, 40, 28, 248, 236, 160, 112);
        if (mob.x >= mob.walk_to && mob.end == -1) {
          sounds['empty'].play();
          mob.end = 1;
        }
      }
      if (mob.never_lost && (!mob.shovel && mob.end_shovel == 0)) {
        mob.walk_to = 294;
        // no shovel
        if (mob.x >= mob.walk_to && mob.end == -1) {
          sounds['empty'].play();
          mob.end = 2;
          mob.dir = 2;
        }
        if (mob.x >= 150 && mob.sword) {
          sounds['hit'].play();
          mob.sword = false;
          mob.end_sword = true;
        }
      }

      if (mob.x <= mob.walk_to) {
        mob.x = mob.x + (100 * dt);
        mob.dir = 1;
        mob.moving = true;
      }
    } else {
      // draw jungle
      // tiles
      var tile_x = 0;
      jungle.tileset.forEach(function(index) {
        ctx.drawImage(jungle_sprite, index*40, 0, 40, 87, tile_x, 0, 160, 348);
        if (jungle.sign == 0 && index == 3)
          ctx.drawImage(items_sprite, 46, 0, 10, 15, tile_x+20, 196, 40, 60);
        tile_x+=160;
      });
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(0, 344, 640, 136);
    }

    // feet
    if (mob.moving) {
      timer_step += dt;
      if (((mob.back_to_beach || mob.win) && timer_step > 0.09) || (!mob.back_to_beach && !mob.win && timer_step > 0.04)) {
        timer_step = 0;
        var step = {};
        if (mob.step) {
          step = {x: mob.x +8, y: mob.y};
          mob.step = 0;
        } else {
          step = {x: mob.x -12, y: mob.y-4};
          mob.step = 1;
        }
        if (mob.beach)
          beach.steps.push(step);
        else
          jungle.steps.push(step);
      }
    }
    // steps
    ctx.fillStyle = '#d6ad09';
    if (mob.beach) {
      beach.steps.forEach(function(step) {
        ctx.fillRect(step.x, step.y, 4, 4);
      });
    } else {
      jungle.steps.forEach(function(step) {
        ctx.fillRect(step.x, step.y, 4, 4);
      });
    }

    // objects
    if (mob.beach) {
      if (beach.shovel)
        ctx.drawImage(items_sprite, 84, 52, 7, 9, 416, 276, 28, 36);
    }
    if (!mob.beach && !mob.win) {
      if (jungle.sword) {
        ctx.drawImage(items_sprite, 56, 0, 4, 9, jungle.sword_x, 292, 16, 36);
      }
      if (jungle.hat) {
        ctx.drawImage(items_sprite, 0, 0, 10, 10, jungle.hat_x, 292, 40, 40);
        if (!mob.hat)
          ctx.drawImage(items_sprite, 36, 0, 10, 5, jungle.hat_x, 292, 40, 20);
      }
      // left sign
      if (jungle.sign == 3)
        ctx.drawImage(items_sprite, 90, 28, 12, 14, 14, 238, 48, 56);
    }

    // draw pirate
    ctx.drawImage(pirate, mob.dir*8, 0, 8, 9, mob.x - 16, mob.y-36, 32, 36);

    // feet
    ctx.fillStyle = '#4e3d1f';
    if (mob.moving) {
      if (Math.ceil(timer * 10) % 2 == 0) {
        sounds['step'].play();
        ctx.fillRect(mob.x+8, mob.y, 4, 4);
      } else {
        ctx.fillRect(mob.x-12, mob.y, 4, 4);
      }
    } else {
      ctx.fillRect(mob.x+8, mob.y, 4, 4);
      ctx.fillRect(mob.x-12, mob.y, 4, 4);
    }

    // equipment
    if (mob.dir == 0) {
      if (mob.shovel)
        ctx.drawImage(items_sprite, 79, 52, 2, 8, mob.x-20, mob.y-32, 8, 32);
      if (mob.sword)
        ctx.drawImage(items_sprite, 60, 0, 2, 10, mob.x+12, mob.y-44, 8, 40);
      if (mob.hat)
        ctx.drawImage(items_sprite, 10, 0, 8, 5, mob.x-16, mob.y-40, 32, 20);
    }
    if (mob.dir == 1) {
      if (mob.hat)
        ctx.drawImage(items_sprite, 18, 0, 10, 5, mob.x-24, mob.y-48, 40, 20);
      if (mob.sword)
        ctx.drawImage(items_sprite, 60, 0, 2, 10, mob.x-12, mob.y-44, 8, 40);
      if (mob.shovel)
        ctx.drawImage(items_sprite, 79, 49, 12, 3, mob.x-28, mob.y-12, 48, 12);
    }
    if (mob.dir == 2) {
      if (mob.shovel)
        ctx.drawImage(items_sprite, 81, 52, 3, 8, mob.x+8, mob.y-20, 12, 32);
      if (mob.hat)
        ctx.drawImage(items_sprite, 28, 0, 8, 5, mob.x-16, mob.y-44, 32, 20);
      if (mob.sword)
        ctx.drawImage(items_sprite, 62, 0, 2, 10, mob.x -20, mob.y-44, 8, 40);
    }
    if (mob.dir == 3) {
      if (mob.shovel)
        ctx.drawImage(items_sprite, 79, 46, 12, 3, mob.x-20, mob.y-12, 48, 12);
      if (mob.sword)
        ctx.drawImage(items_sprite, 62, 0, 2, 10, mob.x -20, mob.y-44, 8, 40);
      if (mob.hat)
        ctx.drawImage(items_sprite, 36, 0, 10, 5, mob.x-16, mob.y-48, 40, 20);
    }
    if (mob.end_shovel == 1) {
      ctx.drawImage(items_sprite, 79, 63, 12, 3, mob.x-16, mob.y-16, 48, 12);
    }
    if (mob.end_shovel == 2) {
      ctx.drawImage(items_sprite, 79, 66, 12, 7, mob.x-16, mob.y-20, 48, 28);
    }

    // end
    if (mob.end > -1) {
      // press enter
      ctx.drawImage(items_sprite, 0, 28, 90, 18, 136, 392, 360, 72);

      // ending panel
      endings[mob.end] = true;
      ctx.fillStyle = '#bd7100';
      ctx.fillRect(142, 32, 356, 4);
      ctx.fillRect(138, 36, 364, 44);
      ctx.fillStyle = '#905600';
      ctx.fillRect(138, 76, 4, 4);
      ctx.fillRect(498, 76, 4, 4);
      ctx.fillRect(142, 80, 356, 4);

      endings.forEach(function(ending, index) {
        ctx.fillStyle = '#bd7100';
        ctx.fillRect(index*36+256+4, 24, 8, 4);
        ctx.fillRect(index*36+256, 28, 16, 4);
        ctx.fillStyle = '#905600';
        ctx.fillRect(index*36+256+4, 28, 8, 8);

        if (ending) {
          ctx.fillStyle = '#ff0033';
          ctx.fillRect(index*36+256+4, 28, 8, 8);

          // red blink on current ending
          if (mob.end == index && Math.ceil(timer * 10) % 3 == 0) {
            ctx.fillStyle = '#905600';
            ctx.fillRect(index*36+256+4, 28, 8, 8);
          }
        }
      });

      ctx.drawImage(items_sprite, 0, mob.end*9+46, 79, 9, 162, 42, 316, 36);
    }

    if (!mob.beach && !mob.win) {
      // draw jungle bottom
      var tileb_x = 0;
      jungle.tilesetb.forEach(function(index) {
        ctx.drawImage(jungle_sprite_b, index*40, 0, 40, 39, tileb_x, 324, 160, 156);
        if (jungle.sign == 2 && index == 3)
          ctx.drawImage(items_sprite, 90, 28, 12, 14, tile_x+100, 404, 48, 56);
        tileb_x+=160;
      });

      // right sign
      if (jungle.sign == 1)
        ctx.drawImage(items_sprite, 46, 0, 10, 15, 586, 332, 40, 60);
    }
    if (mob.end_sword) {
      ctx.drawImage(items_sprite, 56, 0, 4, 9, 150, 304, 16, 36);
    }

    if (jungle.eyes_x > 0 && timer_eyes < 3) {
      ctx.fillStyle = '#ff0033';
      ctx.fillRect(jungle.eyes_x, jungle.eyes_y, 4, 4);
      ctx.fillRect(jungle.eyes_x+12, jungle.eyes_y, 4, 4);
    }
    if (timer_eyes >= 3.2) {
      timer_eyes = 0;
    } else {
      timer_eyes+= dt;
    }

    // message on game complete
    if (game_complete) {
      timeout_game_complete-= dt;

      ctx.fillStyle = 'rgba(189,113,0,0.9)';
      ctx.fillRect(30,30,580,420);

      ctx.drawImage(items_sprite, 0, 81, 99, 9, 122, 100, 396, 36);

      ctx.fillStyle = '#ffffff';
      ctx.font = '20px serif';
      var txt = 'You have found every possible ending and completed the game,\nI hope you enjoyed it.\nDid you find the konami code ending by yourself?\nIf you did, i\'m impressed, give me a shout on twitter @bibishop\n\nPressing Enter again will reset the game and you will lose all\nthe achievements.';
      var x = 60;
      var y = 210;
      var lineheight = 25;
      var lines = txt.split('\n');

      for (var i = 0; i<lines.length; i++) {
        ctx.fillText(lines[i], x, y + (i * lineheight));
      }
    }


    // draw collision
    // beach.bounds.forEach(function(bound) {
    //   ctx.fillStyle = 'rgba(255,255,255,0.2)';
    //   ctx.fillRect(bound.x, bound.y, bound.width, bound.height);
    // });

    mob.prev_x = mob.x;
    mob.prev_y = mob.y;
  });

  function lost(path_taken) {
    mob.path_followed.push(path_taken);
    var cheat_path_part = cheat_path.slice(0,mob.path_followed.length);
    if (cheat_path_part.join(',') == mob.path_followed.join(',')) {
      // following the secret path
      if (mob.path_followed.length == cheat_path.length) {
        mob.lost = false;
        mob.never_lost = true;
        mob.win = true;
        mob.x = 10;
        mob.y = 320;
        mob.cheated = true;
        mob.shovel = true;
      }
      mob.lost = true;
      return;
    } else if (rand_int(40) < mob.chance_to_beach) {
      // back to the beach
      mob.back_to_beach = true;
      mob.beach = true;
      mob.lost = false;
      mob.chance_to_beach = 0;
      mob.x = canvas.width - 10;
      mob.y = 330;
      mob.path_followed = [];
      sounds['screen_change'].play();
      return;
    }
    // truly lost
    mob.lost = true;
    mob.never_lost = false;
    mob.straight_count = 0;
    mob.chance_to_beach++;
  }

  function generate_jungle(path_taken) {
    // if it is already a clone, we update the copy to keep the steps
    if (jungle.clone_index > -1) {
      var jungle_clone_2 = clone(jungle);
      jungle_saved_index = jungle_clone_2.clone_index;
      jungle_save[jungle_clone_2.clone_index] = jungle_clone_2;
    }
    if (jungle.clone_index == -1 && (jungle.hat || (jungle.sign > -1 && jungle_save.length < 3))) {
      // landmark? we save the jungle screen to serve it later so the player feel lost
      // always save when the hat is here, save some signs
      var jungle_clone = clone(jungle);
      jungle_clone.clone_index = jungle_save.length;
      jungle_save.push(jungle_clone);
      jungle_saved_index = jungle_save.length-1;
    }


    jungle = {
      sign: -1,
      sword: false,
      hat: false,
      steps: [],
      bound: [],
      tileset: [],
      tilesetb: [],
      clone_index: -1,
      eyes_x: 0,
      eyes_y: 0
    };
    jungle.steps = [];
    if (mob.beach || mob.win) return;

    // pick a saved jungle
    // need at least 2 saved jungles and don't include if just saved
    if (rand_int(11) > 6 && jungle_save.length > 1) {
      var rand = 0;
      var jungle_save_copy = jungle_save.slice(0);
      if (jungle_saved_index > -1) {
        jungle_save_copy.splice(jungle_saved_index, 1);
      }
      rand = rand_int(jungle_save_copy.length);
      // rand = rand_int(jungle_save.length);

      jungle = clone(jungle_save_copy[rand]);
      sounds['screen_change'].play();

      jungle.tileset.forEach(function(tile, index){
        if (path_taken == 2 && tile == 3)
          mob.x = index*160+82;
      });
      jungle.tilesetb.forEach(function(tile, index){
        if (path_taken == 0 && tile == 3)
          mob.x = index*160+82;
      });

      jungle_saved_index = -1;
      return;
    }
    jungle_saved_index = -1;

    // tiles
    jungle.tileset = [rand_int(3),rand_int(3),rand_int(3),rand_int(3)];
    jungle.tilesetb = [rand_int(3),rand_int(3),rand_int(3),rand_int(3)];
    var index_path_top = rand_int(4);
    var index_path_bottom = rand_int(4);
    jungle.tileset[index_path_top] = 3;
    jungle.tilesetb[index_path_bottom] = 3;

    if (path_taken == 0)
      mob.x = index_path_bottom*160+82;
    if (path_taken == 2)
      mob.x = index_path_top*160+78;

    var eyes_index = rand_int(6);
    // bounds + eyes
    jungle.bounds = [];
    jungle.tileset.forEach(function(tile, index) {
      if (tile == 3) {
        jungle.bounds.push({x: index*160, y: 0, width: 56, height: 308});
        jungle.bounds.push({x: index*160+96, y: 0, width: 64, height: 308});
      } else {
        jungle.bounds.push({x: index*160, y: 0, width: 160, height: 308});

        if (eyes_index == index && tile == 2) {
          jungle.eyes_x = index*160+rand_range(10, 144);
          jungle.eyes_y = rand_range(186, 217);
        }
        eyes_index++;
      }
    });
    jungle.tilesetb.forEach(function(tile, index) {
      if (tile == 3) {
        jungle.bounds.push({x: index*160, y: 344, width: 60, height: 136});
        jungle.bounds.push({x: index*160+100, y: 344, width: 60, height: 136});
      } else {
        jungle.bounds.push({x: index*160, y: 344, width: 160, height: 136});

        if (eyes_index == index) {
          jungle.eyes_x = index*160+rand_range(10, 144);
          jungle.eyes_y = rand_range(424,460);
        }
        eyes_index++;
      }
    });

    // items
    jungle.sword = false;
    jungle.hat = false;
    jungle.sign = -1;
    if (!mob.sword && rand_int(11) > 6) {
      jungle.sword = true;
      jungle.sword_x = rand_range(100,550);
    }
    if (!mob.hat && !jungle.sword && rand_int(11) > 6) {
      jungle.hat = true;
      jungle.hat_x = rand_range(100,550);
    }
    if (!jungle.hat && !jungle.sword && rand_int(11) > 4) {
      var possible_sign_positions = [];
      if (path_taken == 0) possible_sign_positions = [0,1,3];
      if (path_taken == 1) possible_sign_positions = [0,1,2];
      if (path_taken == 2) possible_sign_positions = [1,2,3];
      if (path_taken == 3) possible_sign_positions = [0,2,3];
      jungle.sign = possible_sign_positions[rand_int(3)];
    }

    sounds['screen_change'].play();
  }

  function check_collisions() {
    var bounds = {};
    if (mob.beach)
      bounds = beach.bounds;
    else
      bounds = jungle.bounds;

    bounds.forEach(function(bound) {
      if (bound.x < mob.x &&
        bound.x + bound.width > mob.x &&
        bound.y < mob.y &&
        bound.height + bound.y > mob.y) {
        mob.x = mob.prev_x;
        mob.y = mob.prev_y;
        mob.moving = false;
      }
    });

    if (jungle.sword && jungle.sword_x < mob.x &&
      jungle.sword_x + 20 > mob.x &&
      304 < mob.y &&
      344 > mob.y) {
      jungle.sword = false;
      mob.sword = true;
      sounds['pickup'].play();
    }
    if (!mob.hat && (jungle.hat && jungle.hat_x < mob.x &&
        jungle.hat_x + 40 > mob.x &&
        300 < mob.y &&
        340 > mob.y)) {
      mob.hat = true;
      sounds['pickup'].play();
    }
    if (mob.beach && beach.shovel && (416 < mob.x &&
        432 + 24 > mob.x &&
        268 < mob.y &&
        312 > mob.y)) {
      beach.shovel = false;
      mob.shovel = true;
      sounds['pickup'].play();
    }
  }

  function init() {
    mob = {
      x: 400,
      y: 324,
      dir: 1,
      moving: false,
      step: 0,
      lost: false,
      straight_count: 0,
      chance_to_beach: 0,
      win: false,
      beach: true,
      back_to_beach: false,
      sword: false,
      hat: false,
      shovel: false,
      never_lost: true,
      path_followed: [],
      end: -1,
      cheated: false,
      end_sword: false,
      end_shovel: 0,
      dug: false
    };

    jungle = {
      sign: -1,
      sword: false,
      hat: false,
      steps: [],
      bounds: [],
      tileset: [],
      tilesetb: [],
      clone_index: -1,
      eyes_x: 0,
      eyes_y: 0
    };

    beach = {
      bounds: [
        {x: 0, y: 0, width: 640, height: 284},
        {x: 0, y: 0, width: 360, height: 480},
        {x: 0, y: 380, width: 640, height: 96},
        {x: 580, y: 340, width: 60, height: 140},
        {x: 0, y: 0, width: 372, height: 312},
        {x: 0, y: 0, width: 400, height: 308},
        {x: 0, y: 0, width: 432, height: 304},
        {x: 0, y: 0, width: 464, height: 300},
        {x: 0, y: 0, width: 488, height: 296},
        {x: 468, y: 284, width: 160, height: 24}
      ],
      shovel: true,
      steps: []
    };

    jungle_save = [];

    timer = 0;
    timer_step = 0;
    timer_anim_win = 0;
    timeout_game_complete = 1;
  }

  function clone(obj) {
    var copy;
    if(Array.isArray(obj)) {
      copy = obj.map(function(elm) {
        return Array.isArray(elm) || (typeof elm === 'object' && elm) ? clone(elm) : elm;
      });
    } else {
      copy = {};
      for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) {
          if(Array.isArray(obj[attr]) || (typeof obj[attr] === 'object' && obj[attr])) {
            copy[attr] = clone(obj[attr]);
          } else {
            copy[attr] = obj[attr];
          }
        }
      }
    }
    return copy;
  }

}());

},
};
const cache = {};
function require(name) {
  if (!Object.prototype.hasOwnProperty.call(modules, name)) throw new Error('Unknown module: ' + name);
  if (!cache[name]) {
    const module = cache[name] = { exports: {} };
    modules[name](module, module.exports, require);
  }
  return cache[name].exports;
}
require('./main');
})();
