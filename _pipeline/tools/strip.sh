#!/bin/sh
# usage: strip.sh <framesDir> <out.jpg> <firstFrame> <step> <count> [cols] [width] -> tiles frames first, first+step, ...
D=$1; OUT=$2; A=$3; S=$4; N=$5; C=${6:-6}; W=${7:-480}
T=$(mktemp -d); i=0
while [ $i -lt $N ]; do f=$((A + i * S)); cp "$D/f$(printf %05d $f).jpg" "$T/s$(printf %04d $i).jpg"; i=$((i+1)); done
R=$(( (N + C - 1) / C ))
"$(dirname $0)/node_modules/ffmpeg-static/ffmpeg.exe" -hide_banner -loglevel error -y -i "$T/s%04d.jpg" -vf "scale=$W:-1,tile=${C}x${R}:padding=4" -frames:v 1 "$OUT"
rm -rf "$T"; echo "$N frames from $A step $S -> $OUT"
