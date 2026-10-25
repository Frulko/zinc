#!/bin/sh
# The fake-xochitl harness of the ink lane (ZN-834) and the ink canvas (ZN-839; remarkable-bridge-design.md §8). BY HAND, not in a tier:
# it needs Docker (linux/arm64, the zinc/sdk-rmpp image) and the network for apt and the pinned XOVI sources. Never touches a tablet.
#   sh tests/native/rmpp/fake-xochitl/run.sh
# Inside one throwaway container: XOVI + framebuffer-spy built from source, the lane (bridge.cpp) built with a test vendor row for the
# stub library's hash and the canvas (canvas.cpp), then these scenarios, each printing ok/FAIL:
#   load      the lane loads although the engine is dlopen'ed late (RTLD_LOCAL), and says "lane ready"
#   stroke    block, three Pen swaps, unblock, then the settle repaint of the stroke's box, in that order
#   deadline  a stroke left open is closed by the 500 ms deadline: unblock, EOF to the client
#   crash     xochitl killed while the lane is armed: the next start refuses the lane for the boot
#   double    install.sh refuses an extensions.d where another extension hooks the same symbol
#   hash      a lane without the test row stays off ("vendor library not verified")
#   canvas-install  install.sh canvas refuses while the lane is installed, then records the xochitl hash and installs
#   canvas-load     zinc-canvas loads with no override and says "ready"; a client gets a Welcome with key Canvas
#   canvas-stroke   Pen mode at the stroke's start, one repaint per Ink rectangle and nothing else, UI mode and AppLoad's repaint of the box
#   canvas-crash    xochitl killed while the canvas is armed: the next start refuses it for the boot
#   canvas-hash     an unverified xochitl: one journal line, no socket, the client stays on qtfb; the lease's reopen request is answered
#   canvas-reopen   the document a lease left in /run/zinc-lease/reopen is opened once; Settings.lastOpen is recorded for the next lease
set -eu
cd "$(dirname "$0")/../../../.."
XOVI_REF=${XOVI_REF:-master} EXT_REF=${EXT_REF:-master}   # pin to the commits the tablet runs when recording a result
docker run --rm --platform linux/arm64 -v "$PWD:/work:ro" -e XOVI_REF="$XOVI_REF" -e EXT_REF="$EXT_REF" zinc/sdk-rmpp bash -c '
set -eu
apt-get update -qq >/dev/null && apt-get install -y -qq build-essential pkg-config git python3 cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev \
  qml6-module-qtquick qml6-module-qtquick-window qml6-module-qtqml-workerscript >/dev/null
H=/tmp/h; mkdir -p $H; cd $H
git clone -q https://github.com/asivery/xovi && git -C xovi checkout -q "$XOVI_REF"
git clone -q https://github.com/asivery/rm-xovi-extensions ext && git -C ext checkout -q "$EXT_REF"
(mkdir -p xovi/build && cd xovi/build && cmake .. >/dev/null && make -j4 >/dev/null)
make -C ext/framebuffer-spy OECORE_TARGET_ARCH=aarch64 XOVI_REPO=$H/xovi >/dev/null
QT="$(pkg-config --cflags --libs Qt6Core Qt6Gui Qt6Qml Qt6Quick)"
F=/work/tests/native/rmpp/fake-xochitl
mkdir -p /usr/lib/plugins/scenegraph
g++ -std=c++17 -fPIC -shared $F/stub_qsgepaper.cpp $QT -o /usr/lib/plugins/scenegraph/libqsgepaper.so
/usr/lib/qt6/libexec/moc $F/fake_xochitl.cpp -o $H/fake_xochitl.moc
g++ -std=c++17 -fPIC -I$H $F/fake_xochitl.cpp $QT -o $H/fake-xochitl
g++ -std=c++17 -I/work/integrations/remarkable-ink $F/client.cpp -o $H/client
ext() {  # ext <name> <xovi file> <source> <extra flags>: builds <name>.so from the repository sources
  n=$1 x=$2 s=$3; shift 3
  mkdir -p $H/$n/build
  python3 $H/xovi/util/xovigen.py -o $H/$n/build/xovi.c -H $H/$n/build/xovi.h /work/integrations/remarkable-ink/$x
  gcc -fPIC -c $H/$n/build/xovi.c -o $H/$n/xovi.o
  g++ -std=c++17 -fPIC -shared -Wall -Wextra -I$H/$n -I$H/$n/build "$@" /work/integrations/remarkable-ink/$s $H/$n/xovi.o $QT -ldl -o $H/$n/$n.so
}
lane() { ext zinc-ink bridge.xovi bridge.cpp "$@"; }
X=/home/root/xovi; mkdir -p $X/extensions.d $X/exthome
cp $H/xovi/build/xovi.so $X/xovi.so; cp $H/ext/framebuffer-spy/framebuffer-spy.so $X/extensions.d/
export FAKE_LOG=$H/fake.log ZINC_RMPP_MACHINE="reMarkable Ferrari" QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software
start() { : > $FAKE_LOG; LD_PRELOAD=$X/xovi.so $H/fake-xochitl > $H/x.log 2>&1 & PID=$!; sleep 3; }
stop() { kill $PID; wait $PID 2>/dev/null || true; }
check() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; tail -8 $H/x.log; cat $FAKE_LOG; fi; }

lane -DZINK_TEST_HASH="\"$(sha256sum /usr/lib/plugins/scenegraph/libqsgepaper.so | cut -c1-64)\""
cp $H/zinc-ink/zinc-ink.so $X/extensions.d/
rm -rf /run/zinc-ink
start
check load "grep -q \"lane ready\" $H/x.log"
$H/client stroke >/dev/null; sleep 1
check stroke "grep -v -e ^update -e ^mode $FAKE_LOG | tr \"\n\" \" \" | grep -q \"^block swap 100,100 20x10 content 0 mode 0 swap 118,104 .* swap 136,108 .* unblock\" && grep -q \"^update\" $FAKE_LOG"
: > $FAKE_LOG
check deadline "$H/client stall | grep -q \"closed by the deadline\" && grep -q unblock $FAKE_LOG && grep -q \"stroke deadline\" $H/x.log"
# crash: a client is granted (the lane arms), then xochitl dies
$H/client stall >/dev/null & sleep 0.2; kill -SEGV $PID; wait $PID 2>/dev/null || true
start
check crash "! grep -q \"lane ready\" $H/x.log && grep -q refused /run/zinc-ink/last"
stop
printf "override\$_ZN12QQuickWindow11exposeEventEP12QExposeEvent" > $X/extensions.d/other.so
mkdir -p $H/inst/dist; cp /work/integrations/remarkable-ink/install.sh /work/integrations/remarkable-ink/*.xovi $H/inst/; cp $H/zinc-ink/zinc-ink.so $H/inst/dist/
check double "! XOVI_EXTENSIONS=$X/extensions.d sh $H/inst/install.sh lane 2>&1 | grep -q installed"
rm $X/extensions.d/other.so
lane; cp $H/zinc-ink/zinc-ink.so $X/extensions.d/; rm -rf /run/zinc-ink
start
check hash "grep -q \"vendor library not verified\" $H/x.log && ! grep -q \"lane ready\" $H/x.log"
stop

# The canvas. The fake xochitl is this tablet: install.sh records its hash.
ext zinc-canvas canvas.xovi canvas.cpp; cp $H/zinc-canvas/zinc-canvas.so $H/inst/dist/
I="env XOVI_EXTENSIONS=$X/extensions.d XOCHITL=$H/fake-xochitl sh $H/inst/install.sh canvas"
check canvas-install "$I 2>&1 | grep -q \"zinc-ink.so is installed\" && rm $X/extensions.d/zinc-ink.so && $I | grep -q \"recorded in $X/exthome/zinc-canvas/verified\" && grep -qx \"\$(sha256sum $H/fake-xochitl | cut -c1-64) reMarkable Ferrari\" $X/exthome/zinc-canvas/verified && [ -f $X/extensions.d/zinc-canvas.so ]"
export ZINC_CANVAS_TRACE=1
rm -rf /run/zinc-canvas /run/zinc-lease
start
: > $FAKE_LOG; $H/client stroke > $H/client.log; sleep 1
check canvas-load "grep -q \"\[zinc-canvas\] ready on /run/zinc-ink.sock (Paper Pro\" $H/x.log && grep -q \"^client: welcome\" $H/client.log && grep -q \"canvas granted\" $H/x.log"
# after its first whole (transparent) paint, which has no clip, every paint is one Ink rectangle or the settle box; AppLoad repaints nothing before the pen-up
PAINTS=$(grep -o "paint .*" $H/x.log | grep -v -e "paint 0,0 1620x2160" -e "paint 0,0 0x0" | tr "\n" " ")
check canvas-stroke "[ \"\$PAINTS\" = \"paint 100,100 20x10 paint 118,104 20x10 paint 136,108 20x10 paint 100,100 56x18 \" ] && [ \"\$(tr \"\n\" \" \" < $FAKE_LOG)\" = \"mode Pen  mode UI  update 100,100 56x18 \" ]"
$H/client stall >/dev/null & sleep 0.5; kill -SEGV $PID; wait $PID 2>/dev/null || true
start
check canvas-crash "grep -q \"\[zinc-canvas\] refused: xochitl died while the canvas was armed\" $H/x.log && ! grep -q \"ready on\" $H/x.log"
stop
rm -rf /run/zinc-canvas; mkdir -p /run/zinc-lease; echo 0d9a1c2e-4b5f-4c3d-8e7f-112233445566 > /run/zinc-lease/reopen
mv $X/exthome/zinc-canvas/verified $H/verified
start
check canvas-hash "[ \"\$(grep -c zinc-canvas $H/x.log)\" = 1 ] && grep -q \"\[zinc-canvas\] off: xochitl [0-9a-f]\{64\} (OS .*) is not verified\" $H/x.log && ! $H/client stroke >/dev/null && grep -q \"^no: zinc-canvas is off\" /run/zinc-lease/reopened && [ ! -f /run/zinc-lease/reopen ]"
stop
mv $H/verified $X/exthome/zinc-canvas/verified; rm -rf /run/zinc-canvas /run/zinc-lease; mkdir -p /run/zinc-lease
D=0d9a1c2e-4b5f-4c3d-8e7f-112233445566; echo $D > /run/zinc-lease/reopen
FAKE_LAST_OPEN=aaaaaaaa-0000-0000-0000-000000000000 FAKE_DOCUMENTS=$D start
check canvas-reopen "grep -q \"fake: open $D\" $H/x.log && grep -qx \"yes ok\" /run/zinc-lease/reopened && [ ! -f /run/zinc-lease/reopen ] && grep -qx $D /run/zinc-canvas/document"
stop
'
