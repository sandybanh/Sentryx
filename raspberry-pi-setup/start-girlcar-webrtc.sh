#!/bin/bash
# GirlCar WebRTC Auto-Start Script
# Runs MediaMTX + FFmpeg for low-latency camera streaming
# Stream URL: http://raspberrypi.tail56d975.ts.net:8889/cam

set -e

MEDIAMTX_BIN="$HOME/mediamtx"
MEDIAMTX_CONFIG="$HOME/mediamtx.yml"

# Stream quality tuning (override via env without editing the script)
VIDEO_SIZE="${VIDEO_SIZE:-1280x720}"
VIDEO_FPS="${VIDEO_FPS:-30}"
VIDEO_BITRATE="${VIDEO_BITRATE:-2500k}"
VIDEO_MAXRATE="${VIDEO_MAXRATE:-3000k}"
VIDEO_BUFSIZE="${VIDEO_BUFSIZE:-6000k}"
VIDEO_CRF="${VIDEO_CRF:-22}"

# Wait for camera and network
sleep 5

# Start MediaMTX in background (if not already running)
if ! pgrep -f "mediamtx" > /dev/null; then
    cd "$(dirname "$MEDIAMTX_BIN")"
    ./mediamtx mediamtx.yml &
    sleep 3
fi

# Start FFmpeg - publishes camera to MediaMTX
ffmpeg -loglevel warning \
  -f v4l2 \
  -input_format mjpeg \
  -video_size "$VIDEO_SIZE" \
  -framerate "$VIDEO_FPS" \
  -i /dev/video0 \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -b:v "$VIDEO_BITRATE" \
  -maxrate "$VIDEO_MAXRATE" \
  -bufsize "$VIDEO_BUFSIZE" \
  -crf "$VIDEO_CRF" \
  -pix_fmt yuv420p \
  -profile:v baseline \
  -level 3.1 \
  -g "$VIDEO_FPS" \
  -keyint_min "$VIDEO_FPS" \
  -bf 0 \
  -rtsp_transport tcp \
  -f rtsp rtsp://127.0.0.1:8554/cam
