#!/bin/bash

# GirlCar Raspberry Pi Setup Script
# Run this on your Raspberry Pi after first boot

set -e

echo "🚗 GirlCar Camera Setup"
echo "======================="
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing streaming software..."
sudo apt install -y ffmpeg v4l-utils

# Install Tailscale for remote access
echo "🌐 Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh

# Create streaming directory
mkdir -p ~/girlcar-stream

# Create the streaming script
echo "📝 Creating stream script..."
cat > ~/start-stream.sh << 'STREAMEOF'
#!/bin/bash

# GirlCar Camera Streaming Script
# Streams USB camera via HLS

PORT=8080
STREAM_DIR=~/girlcar-stream
CAMERA=${1:-/dev/video0}

echo "📷 GirlCar Camera Streaming"
echo "==========================="

# Find camera
if [ ! -e "$CAMERA" ]; then
    echo "❌ Camera not found at $CAMERA"
    echo "Available cameras:"
    v4l2-ctl --list-devices
    exit 1
fi

echo "✅ Using camera: $CAMERA"

# Clean old stream files
rm -f $STREAM_DIR/*.ts $STREAM_DIR/*.m3u8

# Get Tailscale IP
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not-connected")
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "📱 Stream URLs:"
echo "   Local:     http://$LOCAL_IP:$PORT/stream.m3u8"
echo "   Tailscale: http://$TAILSCALE_IP:$PORT/stream.m3u8"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start HTTP server
cd $STREAM_DIR
python3 -m http.server $PORT --bind 0.0.0.0 &
HTTP_PID=$!

# Start streaming
ffmpeg -f v4l2 -framerate 30 -video_size 1280x720 -i $CAMERA \
    -c:v libx264 -preset ultrafast -tune zerolatency \
    -g 30 -sc_threshold 0 \
    -f hls \
    -hls_time 1 \
    -hls_list_size 3 \
    -hls_flags delete_segments+append_list \
    -hls_segment_filename "$STREAM_DIR/segment_%03d.ts" \
    "$STREAM_DIR/stream.m3u8"

# Cleanup
kill $HTTP_PID 2>/dev/null
STREAMEOF

chmod +x ~/start-stream.sh

# Create systemd service for auto-start
echo "⚙️ Setting up auto-start service..."
sudo tee /etc/systemd/system/girlcar-stream.service > /dev/null << 'SERVICEEOF'
[Unit]
Description=GirlCar Camera Stream
After=network.target

[Service]
Type=simple
User=pi
ExecStart=/home/pi/start-stream.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Enable service (but don't start yet - need to configure Tailscale first)
sudo systemctl daemon-reload
sudo systemctl enable girlcar-stream.service

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Connect Tailscale:  sudo tailscale up"
echo "   2. Plug in your USB camera"
echo "   3. Test stream:        ~/start-stream.sh"
echo "   4. Start service:      sudo systemctl start girlcar-stream"
echo ""
echo "   Your Tailscale IP:     tailscale ip -4"
echo ""
