#!/bin/sh
# usage: encode.sh <framesDir> <outDir> <name> [posterFrame] [audio.wav]
# Encodes JPEG frames (f00000.jpg ...) at 60 fps into the three deliverables + a 4K poster:
#   <name>_4k60.mp4 (CRF 17), <name>_1080p60.mp4 (CRF 15), <name>_1080p60_web.mp4 (CRF 22, maxrate 8M)
# All H.264 High, yuv420p, BT.709 limited range (converted from the frames' full-range BT.601 JPEG YUV), +faststart.
# With an audio file (the mastered mix, -14 LUFS): AAC-LC 48 kHz stereo, 256 kb/s (192 kb/s in the web cut);
# without one the films are silent (-an), as before.
set -e
FR=$1; OUT=$2; NAME=$3; POSTER=${4:-156}; AUDIO=${5:-}
FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg"
mkdir -p "$OUT"
CS="scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv"
TAGS="-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv"
X264="-c:v libx264 -profile:v high -preset ${PRESET:-medium} -pix_fmt yuv420p -movflags +faststart"
if [ -n "$AUDIO" ]; then AIN="-i $AUDIO"; A1="-c:a aac -b:a 256k -ar 48000 -ac 2 -shortest"; A2="-c:a aac -b:a 192k -ar 48000 -ac 2 -shortest"; else AIN=""; A1="-an"; A2="-an"; fi

echo "==> Encoding ${NAME}_4k60.mp4..."
"$FF" -hide_banner -loglevel info -stats -y -framerate 60 -i "$FR/f%05d.jpg" $AIN \
  -vf "$CS:flags=lanczos,format=yuv420p" $X264 -crf 17 -level 5.2 $TAGS $A1 "$OUT/${NAME}_4k60.mp4"
echo "==> Encoding ${NAME}_1080p60.mp4..."
"$FF" -hide_banner -loglevel info -stats -y -framerate 60 -i "$FR/f%05d.jpg" $AIN \
  -vf "scale=1920:1080:flags=lanczos,$CS,format=yuv420p" $X264 -crf 15 -level 4.2 $TAGS $A1 "$OUT/${NAME}_1080p60.mp4"
echo "==> Encoding ${NAME}_1080p60_web.mp4..."
"$FF" -hide_banner -loglevel info -stats -y -framerate 60 -i "$FR/f%05d.jpg" $AIN \
  -vf "scale=1920:1080:flags=lanczos,$CS,format=yuv420p" $X264 -crf 22 -maxrate 8M -bufsize 16M -level 4.2 $TAGS $A2 "$OUT/${NAME}_1080p60_web.mp4"
echo "==> Extracting poster..."
"$FF" -hide_banner -loglevel error -y -i "$FR/f$(printf %05d "$POSTER").jpg" -q:v 1 "$OUT/poster_4k.jpg"
ls -la "$OUT"
