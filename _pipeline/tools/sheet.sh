#!/bin/sh
# usage: sheet.sh <frameDir> <out.jpg> [cols] [width] [step] [from] [to]
#   tiles every <step>-th frame file (sorted; optionally only files number <from>..<to>) into one contact sheet
D=$1; OUT=$2; C=${3:-4}; W=${4:-480}; S=${5:-1}; A=${6:-0}; B=${7:-999999}
FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg.exe"; [ -x "$FF" ] || FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg"
T=$(mktemp -d); i=0; k=0
for f in $(ls "$D"/f*.jpg | sort); do
  n=$(basename "$f" .jpg | sed 's/^f0*//'); n=${n:-0}
  if [ "$n" -ge "$A" ] && [ "$n" -le "$B" ]; then
    if [ $((k % S)) -eq 0 ]; then cp "$f" "$T/s$(printf %04d $i).jpg"; i=$((i+1)); fi
    k=$((k+1))
  fi
done
R=$(( (i + C - 1) / C ))
"$FF" -hide_banner -loglevel error -y -i "$T/s%04d.jpg" -vf "scale=$W:-1,tile=${C}x${R}:padding=4" -frames:v 1 -q:v 4 "$OUT"
rm -rf "$T"; echo "$i frames -> $OUT"
