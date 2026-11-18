#!/bin/sh
# usage: tile.sh <dir> <out.jpg> [cols] [width] [glob]  -> tiles the matching files (sorted by name) into a contact sheet
D=$1; OUT=$2; C=${3:-4}; W=${4:-480}; G=${5:-t*.jpg}
FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg.exe"; [ -x "$FF" ] || FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg"
T=$(mktemp -d); i=0
for f in $(ls "$D"/$G | sort); do cp "$f" "$T/s$(printf %04d $i).jpg"; i=$((i+1)); done
R=$(( (i + C - 1) / C ))
"$FF" -hide_banner -loglevel error -y -i "$T/s%04d.jpg" -vf "scale=$W:-1,tile=${C}x${R}:padding=4:color=0x2b1b12" -frames:v 1 -q:v 4 "$OUT"
rm -rf "$T"; echo "$i files -> $OUT"
