#!/bin/bash

# Webcam Streaming Server for GirlCar App
# Creates an HLS stream from your webcam

PORT=8080
CAMERA_INDEX=${1:-0}  # Default to camera 0, pass different number as argument
STREAM_DIR="/tmp/girlcar-stream"

echo "📷 GirlCar Webcam Streamer"
echo "=========================="
echo ""

# List available cameras
echo "Available cameras:"
ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -E "^\[AVFoundation.*\] \[[0-9]+\]" | head -10
echo ""

# Clean up old stream files
rm -rf "$STREAM_DIR"
mkdir -p "$STREAM_DIR"

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo "Using camera index: $CAMERA_INDEX"
echo ""
echo "📱 Stream URLs:"
echo "   Local:  http://localhost:$PORT/stream.m3u8"
echo "   Phone:  http://$LOCAL_IP:$PORT/stream.m3u8"
echo ""
echo "👉 Add to your .env file:"
echo "   EXPO_PUBLIC_VIDEO_STREAM_URL=http://$LOCAL_IP:$PORT/stream.m3u8"
echo ""
echo "Press Ctrl+C to stop streaming"
echo "================================"
echo ""

# Start a simple HTTP server in the background
cd "$STREAM_DIR"
python3 -m http.server $PORT --bind 0.0.0.0 &
HTTP_PID=$!

# Give the server a moment to start
sleep 1

# Capture webcam and create HLS stream
ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "$CAMERA_INDEX" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -g 30 -sc_threshold 0 \
  -f hls \
  -hls_time 1 \
  -hls_list_size 3 \
  -hls_flags delete_segments+append_list \
  -hls_segment_filename "$STREAM_DIR/segment_%03d.ts" \
  "$STREAM_DIR/stream.m3u8"

# Cleanup on exit
kill $HTTP_PID 2>/dev/null
rm -rf "$STREAM_DIR"
