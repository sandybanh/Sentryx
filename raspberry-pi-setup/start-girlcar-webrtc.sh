#!/bin/bash
# GirlCar WebRTC Auto-Start Script
# Runs MediaMTX + FFmpeg for low-latency camera streaming
# Stream URL: http://raspberrypi.tail56d975.ts.net:8889/cam

set -e

MEDIAMTX_BIN="$HOME/mediamtx"
MEDIAMTX_CONFIG="$HOME/mediamtx.yml"

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
  -video_size 640x480 \
  -framerate 30 \
  -i /dev/video0 \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -pix_fmt yuv420p \
  -profile:v baseline \
  -level 3.1 \
  -g 30 \
  -keyint_min 30 \
  -bf 0 \
  -rtsp_transport tcp \
  -f rtsp rtsp://127.0.0.1:8554/cam
