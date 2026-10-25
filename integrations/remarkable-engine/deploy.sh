#!/bin/sh
# Installs the engine bundle of tools/rmpp-engine on a reMarkable (developer mode, xovi and AppLoad installed): /home/root/zinc, then a tile per .zapp.
#   ./deploy.sh [root@10.11.99.1] [app.zapp [--session]]...
# It replaces /home/root/zinc and never touches xochitl. The apps go to /home/root/zinc-apps/, which an update keeps.
set -eu
D=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HOST=root@10.11.99.1
case ${1:-} in *@*) HOST=$1; shift ;; esac
R=${ZINC_RMPP_DIR:-/home/root/zinc}   # another directory for a trial beside an installed engine
ssh "$HOST" "rm -rf $R.new && mkdir -p $R.new && tar xzf - -C $R.new && rm -rf $R && mv $R.new/zinc $R && rm -rf $R.new && mkdir -p $R-apps && $R/bin/zinc --version" < "$D/zinc-rmpp.tar.gz"
while [ $# -gt 0 ]; do
  zapp=$1; shift
  flag=; if [ "${1:-}" = --session ]; then flag=--session; shift; fi
  scp -O -q "$zapp" "$HOST:$R-apps/"   # -O: the tablet's dropbear has no SFTP server
  ssh "$HOST" "$R/bin/zinc-tile $R-apps/$(basename "$zapp") $flag"
done
echo "engine in $HOST:$R (bin/zinc run, bin/zinc pack, bin/zinc-tile)"
