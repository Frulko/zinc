#!/bin/sh
# Rebuilds the media of the sample collection from their open-access sources (see ../LICENSES.md): downloads the originals into an empty
# directory, then resizes the photographs (sips), decimates the 3D model (decimate.cpp, on the vendored meshoptimizer), and makes the film
# and the placeholder sound (ffmpeg). macOS; needs curl, sips, ffmpeg and a C++ compiler. The downloads are data: nothing in them is run.
#   examples/museum-table/tools/fetch-collection.sh [work directory, default a new temporary one]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
assets=$here/../assets
repo=$here/../../..
work=${1:-$(mktemp -d)}
mkdir -p "$work/photos" "$work/model" "$work/pano" "$assets/photos" "$assets/models" "$assets/panoramas" "$assets/video" "$assets/audio"

get() {  # destination, url
  [ -s "$1" ] || curl -sS -L --fail -m 900 -H "AIC-User-Agent: zinc-museum-table-demo (open-source sample collection)" -o "$1" "$2"
}
met=https://images.metmuseum.org/CRDImages
aic=https://www.artic.edu/iiif/2
# The Metropolitan Museum of Art, Open Access (CC0)
get "$work/photos/great-wave.jpg"      $met/as/original/DP130155.jpg
get "$work/photos/red-fuji.jpg"        $met/as/original/DP141062.jpg
get "$work/photos/ejiri.jpg"           $met/as/original/DP140977.jpg
get "$work/photos/sudden-shower.jpg"   $met/as/original/DP121525.jpg
get "$work/photos/kanbara-snow.jpg"    $met/as/original/DP109333.jpg
get "$work/photos/three-beauties.jpg"  $met/as/original/DP135586.jpg
get "$work/photos/irises.jpg"          $met/ep/original/DP346474.jpg
get "$work/photos/divan-japonais.jpg"  $met/dp/original/DT224360.jpg
get "$work/photos/nocturne.jpg"        $met/dp/original/DP813769.jpg
# The Art Institute of Chicago, public domain (CC0); its image server asks for the AIC-User-Agent header
get "$work/photos/plum-garden.jpg"     $aic/89a2332f-be15-8e05-bc79-778738fdc1ef/full/1686,/0/default.jpg
get "$work/photos/water-lily-pond.jpg" $aic/8534685d-1102-e1e3-e194-94f6e925e8b0/full/1686,/0/default.jpg
get "$work/photos/the-letter.jpg"      $aic/1fb50815-11e5-2191-a4ed-8e0e5801cc15/full/1686,/0/default.jpg
# Smithsonian Open Access (CC0): the 150 000-triangle OBJ of F1980.191 with its 4096-pixel texture
get "$work/model/vase.zip" "https://3d-api.si.edu/content/document/3d_package:d8c6393a-4ebc-11ea-b77f-2e728ce88125/resources/f1980_191-150k-obj.zip"
# Poly Haven (CC0): the tone-mapped JPEG of the panorama
get "$work/pano/ninomaru_teien.jpg" "https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/ninomaru_teien.jpg"

for f in "$work"/photos/*.jpg; do
  sips -Z 1280 -s format jpeg -s formatOptions 70 "$f" --out "$assets/photos/$(basename "$f")" >/dev/null
done

(cd "$work/model" && unzip -o -q vase.zip)
c++ -O2 -std=c++17 -I "$repo/next/third_party/meshoptimizer" "$here/decimate.cpp" "$repo"/next/third_party/meshoptimizer/*.cpp -o "$work/decimate"
"$work/decimate" "$work/model/f1980_191-150k.obj" "$assets/models/vase.obj" 12000
sips -Z 1536 -s format jpeg -s formatOptions 80 "$work/model/f1980_191-150k-4096-diffuse.jpg" --out "$assets/models/vase.jpg" >/dev/null

sips -z 1024 2048 -s format jpeg -s formatOptions 80 "$work/pano/ninomaru_teien.jpg" --out "$assets/panoramas/ninomaru.jpg" >/dev/null

# the film: ten seconds across the Great Wave, from the foam to Mount Fuji
ffmpeg -v error -y -loop 1 -i "$work/photos/great-wave.jpg" -t 10 \
  -vf "scale=3840:-2,zoompan=z=2.4:x='(iw-iw/zoom)*(0.04+0.50*on/240)':y='(ih-ih/zoom)*(0.10+0.55*on/240)':d=1:s=854x480:fps=24" \
  -frames:v 240 -c:v libx264 -preset slow -crf 32 -pix_fmt yuv420p -movflags +faststart -an "$assets/video/great-wave.mp4"

# the placeholder sound of the narration (a soft note), the same for each language; narration.sh replaces it with a synthesised voice
ffmpeg -v error -y -f lavfi -i "sine=frequency=528:duration=1.6" -af "afade=t=in:d=0.04,afade=t=out:st=0.3:d=1.3,volume=0.35" \
  -ac 1 -ar 22050 -c:a libmp3lame -b:a 32k -map_metadata -1 -fflags +bitexact "$assets/audio/welcome.fr.mp3"
cp "$assets/audio/welcome.fr.mp3" "$assets/audio/welcome.en.mp3"
du -sh "$assets"
