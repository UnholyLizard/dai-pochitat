#!/bin/sh
# usage: encode-vertical.sh <framesDir> <outDir> <name> [posterFrame] [audio.wav]
# Encodes 9:16 JPEG frames (f00000.jpg ..., rendered at 2× = 2160×3840) for Instagram Reels / Stories:
#   <name>_1080x1920_60.mp4  master, 60 fps, CRF 16 (supersampled down from the 2× frames)
#   <name>_ig.mp4            upload file, 30 fps (every other frame), CRF 18, maxrate 12M — Instagram re-encodes to
#                            30 fps anyway; giving it 30 fps avoids its frame-rate conversion
#   <name>_cover.jpg         1080×1920 cover from <posterFrame> (keep the subject inside the centre 1080×1440: the
#                            profile grid crops covers to 3:4)
# All H.264 High, yuv420p, BT.709 limited range (from the frames' full-range BT.601 JPEG YUV), +faststart.
# With an audio file (the mastered mix, -14 LUFS) the master and the upload file carry it (AAC-LC 48 kHz stereo,
# 256 / 192 kb/s) and a silent upload file <name>_ig_silent.mp4 is written too, for posting with music picked in the
# Instagram app; without one every file is silent (-an), as before.
set -e
FR=$1; OUT=$2; NAME=$3; POSTER=${4:-60}; AUDIO=${5:-}
FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg"
mkdir -p "$OUT"
CS="scale=1080:1920:flags=lanczos:in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=tv"
TAGS="-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv"
X264="-c:v libx264 -profile:v high -preset slow -pix_fmt yuv420p -movflags +faststart"
if [ -n "$AUDIO" ]; then
  AIN="-i $AUDIO"; A1="-map 0:v -map 1:a -c:a aac -b:a 256k -ar 48000 -ac 2 -shortest"; A2="-map 0:v -map 1:a -c:a aac -b:a 192k -ar 48000 -ac 2 -shortest"
else AIN=""; A1="-an"; A2="-an"; fi

"$FF" -hide_banner -loglevel error -y -framerate 60 -i "$FR/f%05d.jpg" $AIN \
  -vf "$CS,format=yuv420p" $X264 -crf 16 -level 4.2 $TAGS $A1 "$OUT/${NAME}_1080x1920_60.mp4"
"$FF" -hide_banner -loglevel error -y -framerate 60 -i "$FR/f%05d.jpg" $AIN \
  -vf "fps=30,$CS,format=yuv420p" $X264 -crf 18 -maxrate 12M -bufsize 24M -g 60 -level 4.1 $TAGS $A2 "$OUT/${NAME}_ig.mp4"
if [ -n "$AUDIO" ]; then   # the silent upload file is the same video stream without the audio
  "$FF" -hide_banner -loglevel error -y -i "$OUT/${NAME}_ig.mp4" -map 0:v -c copy -an -movflags +faststart "$OUT/${NAME}_ig_silent.mp4"
fi
"$FF" -hide_banner -loglevel error -y -i "$FR/f$(printf %05d "$POSTER").jpg" -vf "scale=1080:1920:flags=lanczos" -q:v 1 "$OUT/${NAME}_cover.jpg"
ls -la "$OUT"
