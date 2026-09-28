#!/bin/sh
# Regenerates the tiny H.264 test clips of the video examples (committed, ~0.3 MB in total).
set -e
cd "$(dirname "$0")"
E="-c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -g 30 -movflags +faststart -an -y -loglevel error"
mkdir -p looper/media bounce/media quad/media
ffmpeg -f lavfi -i "testsrc2=s=320x180:r=30" -t 3 $E looper/media/01-testsrc.mp4
ffmpeg -f lavfi -i "smptehdbars=s=320x180:r=30,hue=H=2*PI*t/2" -t 2 $E looper/media/02-bars.mp4
ffmpeg -f lavfi -i "life=s=240x180:r=25:mold=10:ratio=0.1:death_color=#202040:life_color=#ffcc00" -t 2 $E looper/media/03-life.mp4
ffmpeg -f lavfi -i "mandelbrot=s=192x108:r=30" -t 4 $E bounce/media/fractal.mp4
ffmpeg -f lavfi -i "testsrc2=s=160x90:r=30" -t 3 $E quad/media/a-testsrc.mp4
ffmpeg -f lavfi -i "smptehdbars=s=160x90:r=30,hue=H=2*PI*t/3" -t 3 $E quad/media/b-bars.mp4
ffmpeg -f lavfi -i "life=s=160x90:r=30:mold=10:life_color=#00ff88" -t 3 $E quad/media/c-life.mp4
ffmpeg -f lavfi -i "cellauto=s=160x90:r=30:rule=110" -t 3 $E quad/media/d-cellauto.mp4
du -ch looper/media/* bounce/media/* quad/media/* | tail -1
