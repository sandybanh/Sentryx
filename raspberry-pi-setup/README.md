# GirlCar Raspberry Pi Setup Guide

Complete guide to set up your Raspberry Pi as a car camera streaming server.

---

## What You're Building

```
┌─────────────────────────────────────────────┐
│                  YOUR CAR                    │
│                                              │
│   [Logitech Camera]                          │
│         │                                    │
│         ▼                                    │
│   [Raspberry Pi] ◄── [Car USB Power]         │
│         │                                    │
│         ▼                                    │
│   [Phone Hotspot / 4G Dongle]                │
└─────────────────────────────────────────────┘
              │
              │ Internet (via Tailscale VPN)
              ▼
        ┌──────────┐
        │  Your    │
        │  Phone   │  ← GirlCar App
        │ Anywhere │
        └──────────┘
```

---

## Step 1: Flash the SD Card (On Your Mac)

1. **Insert your MicroSD card** into your Mac

2. **Open Raspberry Pi Imager**
   ```bash
   open "/Applications/Raspberry Pi Imager.app"
   ```

3. **Configure the image:**
   - Click **"Choose Device"** → Select your Pi model
   - Click **"Choose OS"** → **Raspberry Pi OS (64-bit)** (under "Raspberry Pi OS (other)")
   - Click **"Choose Storage"** → Select your SD card

4. **Click the gear icon ⚙️ (or Ctrl+Shift+X) for settings:**

   | Setting | Value |
   |---------|-------|
   | Set hostname | `girlcar` |
   | Enable SSH | ✅ Yes, use password authentication |
   | Set username | `pi` |
   | Set password | Choose a strong password |
   | Configure WiFi | ✅ Your home WiFi (for initial setup) |
   | WiFi SSID | Your WiFi name |
   | WiFi Password | Your WiFi password |
   | Set locale | Your timezone |

5. **Click "Write"** and wait for it to finish (~5-10 min)

---

## Step 2: First Boot

1. **Eject SD card** from Mac
2. **Insert into Raspberry Pi**
3. **Plug in power** (USB-C or micro-USB depending on Pi model)
4. **Wait 2-3 minutes** for first boot

---

## Step 3: Connect to Your Pi

From your Mac terminal:

```bash
ssh pi@girlcar.local
```

If that doesn't work, find the IP:
```bash
ping girlcar.local
# or check your router for connected devices
```

Password: The one you set in Step 1.

---

## Step 4: Run the Setup Script

Once connected via SSH, run:

```bash
# Download the setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/setup-girlcar.sh | bash

# OR copy-paste the script manually (see below)
```

**Or copy-paste this directly into the Pi terminal:**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo apt update && sudo apt install -y ffmpeg v4l-utils
```

Then create the streaming script (copy from setup-girlcar.sh).

---

## Step 5: Set Up Tailscale

On the Raspberry Pi:

```bash
sudo tailscale up
```

This prints a URL - **open it in your browser** and sign in with the same account you used on your Mac.

Get your Tailscale IP:
```bash
tailscale ip -4
```

Example output: `100.100.100.100`

---

## Step 6: Connect Camera & Test

1. **Plug your Logitech camera** into the Pi's USB port

2. **Check it's detected:**
   ```bash
   v4l2-ctl --list-devices
   ```
   Should show something like "Brio 101" at `/dev/video0`

3. **Start the stream:**
   ```bash
   ~/start-stream.sh
   ```

4. **Test on your Mac:**
   ```bash
   # Get Pi's Tailscale IP
   PIIP=$(tailscale status | grep girlcar | awk '{print $1}')
   echo "Stream URL: http://$PIIP:8080/stream.m3u8"

   # Open in VLC or browser
   open "http://$PIIP:8080/stream.m3u8"
   ```

---

## Step 7: Update the Mobile App

Update your `.env` file with the Tailscale IP:

```
EXPO_PUBLIC_VIDEO_STREAM_URL=http://YOUR_PI_TAILSCALE_IP:8080/stream.m3u8
```

Restart Expo and test the app!

---

## Step 8: Enable Auto-Start

So the stream starts automatically when Pi boots:

```bash
sudo systemctl start girlcar-stream
sudo systemctl status girlcar-stream
```

---

## Step 9: Car Installation

### Power Options:
1. **USB port in car** - Easiest, Pi runs when car is on
2. **USB power bank** - Runs even when car is off
3. **Hardwired to car battery** - Need a 12V to 5V converter

### Internet Options:
1. **Phone hotspot** - Use your phone's data
2. **4G USB dongle** - Dedicated data connection (~$20/month)
3. **Car's built-in WiFi** - If your car has it

### Mounting:
- Velcro tape works great
- Mount Pi under dash or in glove box
- Mount camera on windshield facing out

---

## Troubleshooting

### Can't find Pi on network
```bash
# Try IP instead of hostname
arp -a | grep raspberry
```

### Camera not detected
```bash
# List USB devices
lsusb

# Check video devices
ls -la /dev/video*
```

### Stream not working
```bash
# Check if service is running
sudo systemctl status girlcar-stream

# View logs
sudo journalctl -u girlcar-stream -f
```

### Tailscale not connecting
```bash
# Check status
tailscale status

# Re-authenticate
sudo tailscale up --reset
```

---

## WebRTC Auto-Start (MediaMTX + FFmpeg)

For low-latency streaming to the GirlCar app, use MediaMTX + WebRTC:

**Stream URL:** `http://raspberrypi.tail56d975.ts.net:8889/cam`

### Enable auto-start on Pi boot

1. Copy the service and script to your Pi:
   ```bash
   scp raspberry-pi-setup/girlcar-webrtc.service raspberry-pi-setup/start-girlcar-webrtc.sh me@raspberrypi:~/
   ```

2. On the Pi:
   ```bash
   chmod +x ~/start-girlcar-webrtc.sh
   sudo cp ~/girlcar-webrtc.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable girlcar-webrtc
   sudo systemctl start girlcar-webrtc
   ```

3. Check status:
   ```bash
   sudo systemctl status girlcar-webrtc
   ```

**Prerequisites:** MediaMTX and mediamtx.yml must be in your home directory. Run `~/start-stream.sh` manually first to verify FFmpeg works.

### Quality tuning (MediaMTX + WebRTC)
You can increase stream quality without editing the script by setting env vars:

```bash
export VIDEO_SIZE=1280x720
export VIDEO_FPS=30
export VIDEO_BITRATE=2500k
export VIDEO_MAXRATE=3000k
export VIDEO_BUFSIZE=6000k
export VIDEO_CRF=22
```

Higher quality example (more bandwidth/CPU):

```bash
export VIDEO_SIZE=1920x1080
export VIDEO_FPS=30
export VIDEO_BITRATE=4500k
export VIDEO_MAXRATE=5000k
export VIDEO_BUFSIZE=10000k
export VIDEO_CRF=20
```

---

## Quick Reference

| Command | What it does |
|---------|--------------|
| `ssh me@raspberrypi.local` | Connect to Pi |
| `tailscale ip -4` | Get Tailscale IP |
| `~/start-stream.sh` | Start stream manually |
| `./mediamtx` | Start MediaMTX (WebRTC) |
| `sudo systemctl start girlcar-webrtc` | Start WebRTC service |
| `sudo systemctl stop girlcar-webrtc` | Stop WebRTC service |
| `sudo reboot` | Restart Pi |

---

## Your Stream URL

**WebRTC (low latency):**
```
http://raspberrypi.tail56d975.ts.net:8889/cam
```

**HLS (if using old setup):**
```
http://raspberrypi.tail56d975.ts.net:8080/stream.m3u8
```

This works from **anywhere in the world** as long as:
- Pi has internet (phone hotspot, 4G, etc.)
- Your phone has Tailscale connected
