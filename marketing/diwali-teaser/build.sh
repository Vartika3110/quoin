#!/usr/bin/env bash
# Assemble the teaser: PNG sequence + synthesised score -> Reels-ready H.264.
set -euo pipefail
Q=/home/user/quoin
OUT=$Q/out
mkdir -p "$OUT"

# 1. Normalise the score to the loudness Instagram targets, rather than
#    letting it play back quieter than everything else in the feed.
ffmpeg -y -v error -i "$Q/audio/score.wav" \
  -af "loudnorm=I=-14:TP=-1.0:LRA=11" \
  -ar 48000 -ac 2 -c:a pcm_s16le "$OUT/score_norm.wav"

# 2. Picture + sound. yuv420p and faststart are what make it play
#    everywhere; CRF 17 keeps the gradients in the dark scenes from banding,
#    which is the one artefact this film would show first.
ffmpeg -y -v error \
  -framerate 30 -i "$Q/frames/f%05d.png" \
  -i "$OUT/score_norm.wav" \
  -map 0:v -map 1:a \
  -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p \
  -profile:v high -level 4.1 -g 60 -keyint_min 30 \
  -x264-params "bframes=3:ref=4:aq-mode=2:aq-strength=1.1" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart -shortest \
  -t 20 "$OUT/quoin_diwali_teaser.mp4"

# 3. The individual scenes, cut from the master so they match it exactly.
cut_scene () { # name start duration
  ffmpeg -y -v error -ss "$2" -t "$3" -i "$OUT/quoin_diwali_teaser.mp4" \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k \
    -movflags +faststart "$OUT/scenes/$1.mp4"
}
mkdir -p "$OUT/scenes"
cut_scene 01_spark        0  4
cut_scene 02_vision       4  4
cut_scene 03_taking_shape 8  5
cut_scene 04_brand_reveal 13 4
cut_scene 05_diwali       17 3

# 4. A poster frame for the feed thumbnail.
ffmpeg -y -v error -i "$OUT/quoin_diwali_teaser.mp4" -ss 14.6 -frames:v 1 \
  -q:v 2 "$OUT/quoin_diwali_poster.jpg"

ls -la "$OUT" "$OUT/scenes"
