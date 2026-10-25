#!/bin/sh
# The fake-xochitl harness of the ink lane (ZN-834; remarkable-bridge-design.md §8). BY HAND, not in a tier: it needs Docker
# (linux/arm64, the zinc/sdk-rmpp image) and the network for apt and the pinned XOVI sources. Never touches a tablet.
#   sh tests/native/rmpp/fake-xochitl/run.sh
# Inside one throwaway container: XOVI + framebuffer-spy built from source, the lane (bridge.cpp) built with a test vendor row
# for the stub library's hash, then six scenarios, each printing ok/FAIL:
#   load      the lane loads although the engine is dlopen'ed late (RTLD_LOCAL), and says "lane ready"
#   stroke    block, three Pen swaps, unblock, then the settle repaint of the stroke's box, in that order
#   deadline  a stroke left open is closed by the 500 ms deadline: unblock, EOF to the client
#   crash     xochitl killed while the lane is armed: the next start refuses the lane for the boot
#   double    install.sh refuses an extensions.d where another extension hooks the same symbol
#   hash      a lane without the test row stays off ("vendor library not verified")
set -eu
cd "$(dirname "$0")/../../../.."
XOVI_REF=${XOVI_REF:-master} EXT_REF=${EXT_REF:-master}   # pin to the commits the tablet runs when recording a result
docker run --rm --platform linux/arm64 -v "$PWD:/work:ro" -e XOVI_REF="$XOVI_REF" -e EXT_REF="$EXT_REF" zinc/sdk-rmpp bash -c '
set -eu
apt-get update -qq >/dev/null && apt-get install -y -qq git python3 cmake qt6-base-dev qt6-base-dev-tools qt6-declarative-dev >/dev/null
H=/tmp/h; mkdir -p $H; cd $H
git clone -q https://github.com/asivery/xovi && git -C xovi checkout -q "$XOVI_REF"
git clone -q https://github.com/asivery/rm-xovi-extensions ext && git -C ext checkout -q "$EXT_REF"
(mkdir -p xovi/build && cd xovi/build && cmake .. >/dev/null && make -j4 >/dev/null)
make -C ext/framebuffer-spy OECORE_TARGET_ARCH=aarch64 XOVI_REPO=$H/xovi >/dev/null
QT="$(pkg-config --cflags --libs Qt6Core Qt6Gui Qt6Quick)"
F=/work/tests/native/rmpp/fake-xochitl
mkdir -p /usr/lib/plugins/scenegraph
g++ -std=c++17 -fPIC -shared $F/stub_qsgepaper.cpp $QT -o /usr/lib/plugins/scenegraph/libqsgepaper.so
/usr/lib/qt6/libexec/moc $F/fake_xochitl.cpp -o $H/fake_xochitl.moc
g++ -std=c++17 -I$H $F/fake_xochitl.cpp $QT -o $H/fake-xochitl
g++ -std=c++17 -I/work/integrations/remarkable-ink $F/client.cpp -o $H/client
lane() {  # lane <extra flags>: builds zinc-ink.so from the repository sources
  mkdir -p $H/lane/build
  python3 $H/xovi/util/xovigen.py -o $H/lane/build/xovi.c -H $H/lane/build/xovi.h /work/integrations/remarkable-ink/bridge.xovi
  gcc -fPIC -c $H/lane/build/xovi.c -o $H/lane/xovi.o
  g++ -std=c++17 -fPIC -shared -Wall -Wextra -I$H/lane "$@" /work/integrations/remarkable-ink/bridge.cpp $H/lane/xovi.o $QT -ldl -o $H/lane/zinc-ink.so
}
X=/home/root/xovi; mkdir -p $X/extensions.d $X/exthome
cp $H/xovi/build/xovi.so $X/xovi.so; cp $H/ext/framebuffer-spy/framebuffer-spy.so $X/extensions.d/
export FAKE_LOG=$H/fake.log ZINC_RMPP_MACHINE="reMarkable Ferrari" QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software
start() { : > $FAKE_LOG; LD_PRELOAD=$X/xovi.so $H/fake-xochitl > $H/x.log 2>&1 & PID=$!; sleep 3; }
check() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; tail -5 $H/x.log; cat $FAKE_LOG; fi; }

lane -DZINK_TEST_HASH="\"$(sha256sum /usr/lib/plugins/scenegraph/libqsgepaper.so | cut -c1-64)\""
cp $H/lane/zinc-ink.so $X/extensions.d/
rm -rf /run/zinc-ink
start
check load "grep -q \"lane ready\" $H/x.log"
$H/client stroke >/dev/null; sleep 1
check stroke "grep -v ^update $FAKE_LOG | tr \"\n\" \" \" | grep -q \"^block swap 100,100 20x10 content 0 mode 0 swap 118,104 .* swap 136,108 .* unblock\" && grep -q \"^update\" $FAKE_LOG"
: > $FAKE_LOG
check deadline "$H/client stall | grep -q \"closed by the deadline\" && grep -q unblock $FAKE_LOG && grep -q \"stroke deadline\" $H/x.log"
# crash: a client is granted (the lane arms), then xochitl dies
$H/client stall >/dev/null & sleep 0.2; kill -SEGV $PID; wait $PID 2>/dev/null || true
start
check crash "! grep -q \"lane ready\" $H/x.log && grep -q refused /run/zinc-ink/last"
kill $PID; wait $PID 2>/dev/null || true
printf "override\$_ZN12QQuickWindow11exposeEventEP12QExposeEvent" > $X/extensions.d/other.so
mkdir -p $H/inst/dist; cp /work/integrations/remarkable-ink/install.sh /work/integrations/remarkable-ink/bridge.xovi $H/inst/; cp $H/lane/zinc-ink.so $H/inst/dist/
check double "! XOVI_EXTENSIONS=$X/extensions.d sh $H/inst/install.sh 2>&1 | grep -q installed"
rm $X/extensions.d/other.so
lane; cp $H/lane/zinc-ink.so $X/extensions.d/; rm -rf /run/zinc-ink
start
check hash "grep -q \"vendor library not verified\" $H/x.log && ! grep -q \"lane ready\" $H/x.log"
kill $PID; wait $PID 2>/dev/null || true
'
