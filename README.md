# Sentryx

This repository contains the **mobile app** for Sentryx, a hardware‑integrated vehicle security system.

## Quick start

1) Install dependencies
```bash
npm install
```

2) Create environment file
```bash
cp .env.example .env
```

3) Start Expo
```bash
npx expo start
```

4) Run on your phone (Expo Go)
- Install **Expo Go** from the App Store or Google Play.
- Make sure your phone and computer are on the same Wi‑Fi.
- Scan the QR code shown in the terminal with your phone.

## Expo Go setup

1) Install **Expo Go** on your phone.
2) Ensure your phone and dev machine are on the same Wi‑Fi.
3) Run the app:
```bash
npx expo start
```
4) Scan the QR code in the terminal to open the app.
5) If you’re using a backend on your laptop, set `EXPO_PUBLIC_BACKEND_URL` to your machine’s LAN or Tailscale IP.

## Inspiration

Women face disproportionate safety risks in and around their vehicles, from being followed in parking lots to vandalism, break-ins, or suspicious loitering. Traditional car alarms are passive and reactive, offering little context or real-time awareness. We wanted to explore how AI and hardware could transform a car into an active security system that helps users feel informed and supported when something feels unsafe.

Sentryx was inspired by the gap between existing vehicle security systems and real-world safety concerns many women experience daily.

## What it does

Sentryx is an AI-powered vehicle security system that monitors a car for suspicious activity and alerts the user in real time. It detects unfamiliar faces, movement near the vehicle, impacts around the tires, and trunk disturbances. A servo-mounted dashcam physically rotates toward detected motion or sound, while a mobile app streams live video and sends real-time alerts and location sharing to trusted contacts.

## How we built it

Sentryx combines computer vision, embedded hardware, and a mobile application:

- OpenCV is used for motion detection around the vehicle
- Google Gemini is used for facial recognition to identify unfamiliar faces
- A Raspberry Pi handles live video streaming from the dashcam
- An ESP32 manages sensors and IoT communication
- Motion, light, impact sensors detect tampering or break-ins
- A servo motor physically rotates the dashcam toward detected motion or sound
- A React Native mobile app streams live video and delivers real-time alerts and location sharing

Sensor data and vision signals are combined to determine when activity may be suspicious and notify the user immediately.

## Challenges we ran into

Integrating real-time computer vision with physical hardware was one of our biggest challenges. Coordinating sensor data from the ESP32 with live video streaming on the Raspberry Pi while keeping latency low required careful synchronization. Physically rotating the camera based on motion or sound detection without disrupting the video feed was also non-trivial. Additionally, tuning detection thresholds to reduce false positives while still prioritizing safety took multiple iterations.

## Accomplishments that we're proud of

We successfully built a working end-to-end system that combines AI, embedded hardware, and a mobile app. Sentryx can detect motion and unfamiliar faces, physically rotate a dashcam toward suspicious activity, and stream live video with real-time alerts to a mobile app. We’re especially proud of integrating multiple sensors with computer vision in a way that feels responsive and practical for real-world use.

## What we learned

Through this project, we learned how to integrate AI-powered perception with embedded systems, manage real-time constraints, and coordinate multiple hardware components. We gained hands-on experience with OpenCV motion detection, using Google Gemini for facial recognition, IoT communication with the ESP32, and live video streaming from a Raspberry Pi. We also learned the importance of balancing detection accuracy with user trust in safety-focused systems.

## What's next for Sentryx

Next, we plan to improve detection accuracy and reduce false positives through better sensor fusion and model tuning. We’d like to enhance the mobile app experience, explore secure cloud storage for recorded clips, and investigate ways to make Sentryx more accessible and deployable at scale. Long-term, we envision Sentryx as a proactive vehicle safety platform that adapts to different environments and user needs.

## Notes
- If you change `.env`, reload the app in Expo (or restart the dev server).
- For iOS simulator: `npx expo start --ios`
- For Android emulator: `npx expo start --android`
