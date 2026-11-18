#!/bin/sh
# usage: qa.sh <videoDir> <name> <contactSheet.jpg>
# Prints resolution / fps / duration / profile / colour tags of every deliverable and makes a 1-fps contact sheet of the
# web cut (8 columns, 480 px tiles).
set -e
DIR=$1; NAME=$2; SHEET=$3
FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="$(dirname "$0")/node_modules/ffmpeg-static/ffmpeg"
for f in "$DIR/${NAME}_4k60.mp4" "$DIR/${NAME}_1080p60.mp4" "$DIR/${NAME}_1080p60_web.mp4" "$DIR/poster_4k.jpg"; do
  printf '%s  %s bytes\n' "$(basename "$f")" "$(wc -c < "$f" | tr -d ' ')"
  "$FF" -hide_banner -i "$f" 2>&1 | grep -E "Duration|Stream" | sed 's/^ */  /'
done
"$FF" -hide_banner -loglevel error -y -i "$DIR/${NAME}_1080p60_web.mp4" -vf "fps=1,scale=480:-1,tile=8x7:padding=6:color=0x080d10" -frames:v 1 -q:v 3 "$SHEET"
echo "contact sheet -> $SHEET"
