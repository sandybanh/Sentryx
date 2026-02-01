/**
 * Native WebRTC camera component for MediaMTX streams.
 * Connects to MediaMTX WHEP endpoint for low-latency video.
 *
 * Requires a development build (npx expo run:ios) - does NOT work in Expo Go.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { RTCPeerConnection, RTCView } from 'react-native-webrtc';

import { Colors } from '@/constants/theme';

interface WebRTCCameraProps {
  /** MediaMTX stream URL, e.g. http://raspberrypi.tail56d975.ts.net:8889/cam */
  url: string;
  onConnected?: () => void;
  onError?: (error: string) => void;
  style?: object;
}

/**
 * Parse MediaMTX URL to get WHEP endpoint.
 * http://host:8889/cam -> http://host:8889/cam/whep
 */
function getWhepEndpoint(url: string): string {
  const clean = url.replace(/\/$/, '');
  return `${clean}/whep`;
}

export function WebRTCCamera({
  url,
  onConnected,
  onError,
  style,
}: WebRTCCameraProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const connect = useCallback(async () => {
    try {
      const whepUrl = getWhepEndpoint(url);
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setStream(event.streams[0]);
          onConnected?.();
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          onError?.(`Connection ${pc.iceConnectionState}`);
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering (with timeout)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const timeout = setTimeout(resolve, 2000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      const sdp = pc.localDescription?.sdp;
      if (!sdp) {
        throw new Error('No local description');
      }

      // POST to MediaMTX WHEP endpoint
      const res = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Accept: 'application/sdp',
        },
        body: sdp,
      });

      if (!res.ok) {
        throw new Error(`WHEP request failed: ${res.status}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg);
    }
  }, [url, onConnected, onError]);

  useEffect(() => {
    connect();
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      setStream(null);
    };
  }, [connect]);

  if (!stream) {
    return <View style={[styles.container, style]} />;
  }

  return (
    <RTCView
      streamURL={stream.toURL()}
      style={[styles.video, style]}
      objectFit="contain"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[900],
  },
  video: {
    flex: 1,
    backgroundColor: Colors.neutral[900],
  },
});
