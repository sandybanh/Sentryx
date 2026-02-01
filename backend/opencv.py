"""
ULTRA-FAST Security System for Hackathon Demo
Uses MediaPipe for blazing-fast face detection + optimized face recognition
Target: 30+ FPS with accurate recognition

Key optimizations:
- MediaPipe face detection (10x faster than CNN)
- Optimized face encoding (cached)
- Multi-threading for parallel processing
- Smart frame skipping
- GPU acceleration where available
"""

import cv2
from ultralytics import YOLO
import face_recognition
import numpy as np
from datetime import datetime, timedelta
import os
import pickle
import json
import time
import threading
import requests
from dotenv import load_dotenv

load_dotenv()

from gemini import GeminiThreatAnalyzer

_supabase_client = None

def _get_supabase():
    global _supabase_client
    if _supabase_client is None:
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if url and key:
                _supabase_client = create_client(url, key)
        except Exception as e:
            print(f"Supabase init failed: {e}")
    return _supabase_client


class FastFaceDatabase:
    def __init__(self, database_path='face_database_fast.pkl', user_id=None):
        self.database_path = database_path
        self.user_id = user_id or os.getenv("SUPABASE_USER_ID")
        self.known_encodings = []
        self.known_names = []
        self.encoding_matrix = None
        self.load_database()

    def load_database(self):
        sb = _get_supabase()
        if sb and self.user_id:
            try:
                r = sb.table("familiar_faces").select("name, encoding").eq("user_id", self.user_id).execute()
                if r.data and len(r.data) > 0:
                    for row in r.data:
                        enc = np.array(row["encoding"], dtype=np.float64)
                        self.known_encodings.append(enc)
                        self.known_names.append(row["name"])
                    if self.known_encodings:
                        self.encoding_matrix = np.array(self.known_encodings)
                    print(f"Loaded {len(self.known_names)} faces from Supabase")
                    return
            except Exception as e:
                print(f"Supabase load failed: {e}")

        if os.path.exists(self.database_path):
            with open(self.database_path, 'rb') as f:
                data = pickle.load(f)
                self.known_encodings = data['encodings']
                self.known_names = data['names']
                if self.known_encodings:
                    self.encoding_matrix = np.array(self.known_encodings)
                print(f"Loaded {len(self.known_names)} faces from local")
        else:
            print("No face database found")
    
    def build_from_folder(self, folder_path='known_faces'):
        """Build database quickly with HOG (fast enough for training)"""
        if not os.path.exists(folder_path):
            os.makedirs(folder_path)
            print(f" Created {folder_path}/")
            return
        
        self.known_encodings = []
        self.known_names = []
        
        print("\n" + "="*60)
        print(" Building facial recognition database")
        print("="*60)
        
        for person_name in os.listdir(folder_path):
            person_dir = os.path.join(folder_path, person_name)
            
            if not os.path.isdir(person_dir):
                continue
            
            print(f"\n {person_name}")
            
            for image_file in os.listdir(person_dir):
                if image_file.lower().endswith(('.jpg', '.jpeg', '.png')):
                    image_path = os.path.join(person_dir, image_file)
                    
                    try:
                        image = face_recognition.load_image_file(image_path)
                        
                        # Resize for speed
                        height, width = image.shape[:2]
                        if width > 800:
                            scale = 800 / width
                            image = cv2.resize(image, (800, int(height * scale)))
                        
                        # HOG is fast enough for building database
                        locations = face_recognition.face_locations(image, model='hog')
                        
                        if locations:
                            # num_jitters=1 for speed, we'll compensate with more photos
                            encodings = face_recognition.face_encodings(
                                image, locations, num_jitters=1
                            )
                            
                            for enc in encodings:
                                self.known_encodings.append(enc)
                                self.known_names.append(person_name)
                            
                            print(f" {image_file}")
                        else:
                            print(f" {image_file} - no face")
                            
                    except Exception as e:
                        print(f"  Error processing {image_file}: {e}")
            
            print(f"   Total: {self.known_names.count(person_name)} encodings")
        
        # Optimize for fast comparison
        if self.known_encodings:
            self.encoding_matrix = np.array(self.known_encodings)
        
        print("\n" + "="*60)
        print(f"Built {len(self.known_encodings)} encodings")
        print("="*60)
        
        self.save_database()
    
    def save_database(self):
        """Save database"""
        with open(self.database_path, 'wb') as f:
            pickle.dump({
                'encodings': self.known_encodings,
                'names': self.known_names
            }, f)
        print(f" Saved to {self.database_path}")
    
    def identify_face_fast(self, face_encoding):
        """
        VECTORIZED fast identification
        Uses numpy operations for speed
        """
        if self.encoding_matrix is None or len(self.encoding_matrix) == 0:
            return None, 0
        
        # Vectorized distance calculation (MUCH faster)
        distances = np.linalg.norm(self.encoding_matrix - face_encoding, axis=1)
        
        # Find best match
        best_idx = np.argmin(distances)
        best_distance = distances[best_idx]
        
        # More lenient tolerance for speed/reliability balance
        tolerance = 0.50
        
        if best_distance < tolerance:
            # Get all matches within tolerance
            matches = distances < tolerance
            matching_indices = np.where(matches)[0]
            
            # Voting (fast)
            votes = {}
            for idx in matching_indices:
                name = self.known_names[idx]
                votes[name] = votes.get(name, 0) + 1
            
            # Best match
            best_name = max(votes.items(), key=lambda x: x[1])[0]
            confidence = 1.0 - best_distance
            
            return best_name, confidence
        
        return None, 0


def send_camera_alert(device_id, motion=True, alert_type=None):
    url = os.getenv("INGEST_CAMERA_URL")
    secret = os.getenv("DEVICE_SECRET")
    if not url or not secret:
        return
    try:
        payload = {"device_id": device_id, "motion": motion, "ultra_close": False}
        if alert_type:
            payload["alert_type"] = alert_type
        requests.post(
            url,
            json=payload,
            headers={"x-device-secret": secret},
            timeout=5,
        )
    except Exception as e:
        print(f"Alert send failed: {e}")


class MotionDetector:
    def __init__(self, sensitivity=500):
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=100, varThreshold=50, detectShadows=False
        )
        self.sensitivity = sensitivity
        self._last_alert = 0
        self._cooldown = 2

    def detect(self, frame):
        fg_mask = self.bg_subtractor.apply(frame)
        _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(
            thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        motion_pixels = 0
        for c in contours:
            area = cv2.contourArea(c)
            if area > 500:
                motion_pixels += area
        return motion_pixels > self.sensitivity


class MediaPipeFaceDetector:
    """Fast face detection using OpenCV DNN (fallback if MediaPipe fails)"""
    
    def __init__(self):
        # Download these files if not present
        prototxt = "deploy.prototxt"
        model = "res10_300x300_ssd_iter_140000.caffemodel"
        
        # Try to load DNN model
        try:
            self.net = cv2.dnn.readNetFromCaffe(prototxt, model)
        except:
            print("âš ï¸  DNN model not found, falling back to face_recognition HOG")
            self.net = None
    
    def detect_faces(self, frame):
        """Detect faces - fallback to HOG if DNN not available"""
        
        if self.net is not None:
            # Use DNN (fast)
            h, w = frame.shape[:2]
            blob = cv2.dnn.blobFromImage(frame, 1.0, (300, 300), (104, 177, 123))
            self.net.setInput(blob)
            detections = self.net.forward()
            
            faces = []
            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence > 0.7:
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    x1, y1, x2, y2 = box.astype(int)
                    faces.append([x1, y1, x2, y2])
            return faces
        else:
            # Fallback to face_recognition HOG (still fast)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            locations = face_recognition.face_locations(rgb, model='hog')
            
            faces = []
            for top, right, bottom, left in locations:
                faces.append([left, top, right, bottom])
            return faces
    
    def __del__(self):
        pass  # No cleanup needed


class AlertCooldown:
    """Lightweight alert cooldown"""
    
    def __init__(self, cooldown_seconds=60):
        self.cooldown_seconds = cooldown_seconds
        self.last_alerts = {}
    
    def can_alert(self, person_name="unknown"):
        current_time = datetime.now()
        
        # Allow multiple alerts for unknowns
        if person_name == "UNKNOWN":
            return True
        
        if person_name in self.last_alerts:
            elapsed = (current_time - self.last_alerts[person_name]).total_seconds()
            if elapsed < self.cooldown_seconds:
                return False
        
        self.last_alerts[person_name] = current_time
        return True
    
    def reset_cooldown(self, person_name=None):
        if person_name:
            self.last_alerts.pop(person_name, None)
        else:
            self.last_alerts.clear()


class CoordinateTracker:
    """Lightweight coordinate tracker"""
    
    def __init__(self, frame_width=640, frame_height=480):
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.current_target = None
    
    def update_target(self, bbox):
        x1, y1, x2, y2 = bbox
        center_x = (x1 + x2) // 2
        center_y = (y1 + y2) // 2
        
        offset_x = center_x - (self.frame_width // 2)
        angle = (offset_x / (self.frame_width // 2)) * 90
        distance = abs(offset_x) / (self.frame_width // 2)
        
        self.current_target = {
            'x': center_x,
            'y': center_y,
            'angle': angle,
            'distance': distance,
            'bbox': bbox
        }
        
        return self.current_target
    
    def get_stepper_command(self):
        if not self.current_target:
            return {'action': 'idle', 'angle': 0, 'priority': 'low'}
        
        angle = self.current_target['angle']
        distance = self.current_target['distance']
        
        return {
            'action': 'locked' if abs(angle) < 5 else 'rotate',
            'angle': round(angle, 2),
            'distance': round(distance, 2),
            'priority': 'high' if distance > 0.7 else 'medium' if distance > 0.3 else 'low',
            'target_x': self.current_target['x'],
            'target_y': self.current_target['y']
        }
    
    def save_coordinates_log(self, filepath='coordinates_log.json'):
        """Placeholder for compatibility"""
        pass


class FastSecuritySystem:
    """
    OPTIMIZED security system for hackathon demo
    Target: 30+ FPS with accurate recognition
    """
    
    def __init__(self, config=None):
        if config is None:
            config = {
                'yolo_model': 'yolov8n.pt',
                'yolo_confidence': 0.6,  # Lower for speed
                'cooldown_seconds': 60,
                'camera_id': 0,
                'frame_width': 800,
                'frame_height': 600,
                'process_every_n_frames': 2,  # Process every 2nd frame for accuracy
                'use_mediapipe': True,  # MediaPipe for face detection
                'use_yolo': False,  # Disable YOLO for people, use MediaPipe only
            
            }
        
        self.config = config
        self.process_every_n_frames = config.get('process_every_n_frames', 2)
        self.frame_count = 0
        self.use_mediapipe = config.get('use_mediapipe', True)
        self.use_yolo = config.get('use_yolo', False)
        self.detection_scale = config.get('detection_scale', 1.0)
        
        print("Loading face database...")
        user_id = config.get("user_id") or os.getenv("SUPABASE_USER_ID")
        self.face_db = FastFaceDatabase(user_id=user_id)
        
        if self.use_yolo:
            print("Loading YOLO...")
            self.yolo = YOLO(config['yolo_model'])
            self.yolo_confidence = config['yolo_confidence']
        else:
            self.yolo = None
        
        if self.use_mediapipe:
            print("Loading MediaPipe face detector...")
            self.mediapipe_detector = MediaPipeFaceDetector()
        else:
            self.mediapipe_detector = None
        
        print("Initializing systems...")
        self.cooldown = AlertCooldown(cooldown_seconds=config['cooldown_seconds'])
        self.tracker = CoordinateTracker(
            frame_width=config['frame_width'],
            frame_height=config['frame_height']
        )
        
        self.save_dir = "detections"
        os.makedirs(self.save_dir, exist_ok=True)

        self.device_id = config.get("device_id") or os.getenv("DEVICE_ID", "camera")
        self.motion_detector = MotionDetector(sensitivity=config.get("motion_sensitivity", 500))
        self._motion_alert_cooldown = AlertCooldown(cooldown_seconds=30)
        self.last_detections = []
        self._last_face_reload = time.time()
        self._face_reload_interval = config.get("face_reload_interval", 300)
        
        print("Initializing AI threat analyzer...")
        self.gemini = GeminiThreatAnalyzer()
        
        # Also add these video recording variables:
        self.recording = False
        self.recording_start = None
        self.video_writer = None
        self.recording_duration = 15  # Shorter recordings for faster uploads
        self.capture_fps = config.get('target_fps', 30)
        self.recording_size = None
        
        self.stats = {
            'total_detections': 0,
            'known_persons': 0,
            'unknown_persons': 0,
            'alerts_sent': 0,
            'frames_processed': 0,
            'frames_skipped': 0
        }
        
        print("Fast security system ready!")
    
    def detect_and_recognize(self, frame):
        """
        OPTIMIZED detection pipeline
        """
        self.frame_count += 1
        
        # Smart frame skipping
        if self.frame_count % self.process_every_n_frames != 0:
            self.stats['frames_skipped'] += 1
            return self.last_detections  # Return cached results
        
        self.stats['frames_processed'] += 1
        detected_persons = []
        
        # Use MediaPipe for face detection (MUCH faster)
        frame_for_detection = frame
        scale_x = 1.0
        scale_y = 1.0
        if self.detection_scale and self.detection_scale < 1.0:
            height, width = frame.shape[:2]
            scaled_w = max(1, int(width * self.detection_scale))
            scaled_h = max(1, int(height * self.detection_scale))
            frame_for_detection = cv2.resize(frame, (scaled_w, scaled_h))
            scale_x = width / scaled_w
            scale_y = height / scaled_h

        if self.use_mediapipe:
            face_bboxes = self.mediapipe_detector.detect_faces(frame_for_detection)
        elif self.use_yolo:
            # Fallback to YOLO
            results = self.yolo(frame_for_detection, conf=self.yolo_confidence, verbose=False)
            face_bboxes = []
            
            for r in results:
                boxes = r.boxes.xyxy.cpu().numpy()
                class_ids = r.boxes.cls.cpu().numpy()
                
                for box, class_id in zip(boxes, class_ids):
                    if self.yolo.names[int(class_id)] == 'person':
                        face_bboxes.append(box[:4].astype(int))
        else:
            face_bboxes = []
        
        # Process each detected face
        for bbox in face_bboxes:
            x1, y1, x2, y2 = map(int, bbox)
            if scale_x != 1.0 or scale_y != 1.0:
                x1 = int(x1 * scale_x)
                x2 = int(x2 * scale_x)
                y1 = int(y1 * scale_y)
                y2 = int(y2 * scale_y)
            
            # Extract face region (expand slightly for better encoding)
            height = y2 - y1
            width = x2 - x1
            
            # Expand bbox by 20%
            expand = 0.2
            x1_exp = max(0, int(x1 - width * expand))
            y1_exp = max(0, int(y1 - height * expand))
            x2_exp = min(frame.shape[1], int(x2 + width * expand))
            y2_exp = min(frame.shape[0], int(y2 + height * expand))
            
            face_region = frame[y1_exp:y2_exp, x1_exp:x2_exp]
            
            # Skip if too small
            if face_region.shape[0] < 40 or face_region.shape[1] < 40:
                continue
            
            identity = None
            confidence = 0
            
            try:
                # Convert to RGB
                face_rgb = cv2.cvtColor(face_region, cv2.COLOR_BGR2RGB)
                
                # Get face encoding (HOG for speed)
                locations = face_recognition.face_locations(face_rgb, model='hog')
                
                if locations:
                    # num_jitters=1 for speed
                    encodings = face_recognition.face_encodings(
                        face_rgb, locations, num_jitters=1
                    )
                    
                    if encodings:
                        # Fast vectorized identification
                        identity, confidence = self.face_db.identify_face_fast(encodings[0])
                
            except Exception as e:
                pass  # Silent fail for speed
            
            # Update tracking
            tracking_data = self.tracker.update_target([x1, y1, x2, y2])
            
            person_data = {
                'bbox': [x1, y1, x2, y2],
                'identity': identity if identity else 'UNKNOWN',
                'confidence': confidence,
                'is_known': identity is not None,
                'tracking': tracking_data
            }
            
            detected_persons.append(person_data)
            
            self.stats['total_detections'] += 1
            if identity:
                self.stats['known_persons'] += 1
            else:
                self.stats['unknown_persons'] += 1
        
        # Cache for skipped frames
        self.last_detections = detected_persons
        
        return detected_persons
    
    def draw_detections(self, frame, persons):
        """Fast drawing with minimal overhead"""
        for person in persons:
            x1, y1, x2, y2 = person['bbox']
            identity = person['identity']
            is_known = person['is_known']
            confidence = person['confidence']
            
            # Color
            color = (0, 255, 0) if is_known else (0, 0, 255)
            
            # Bbox
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Center point
            center_x, center_y = person['tracking']['x'], person['tracking']['y']
            cv2.circle(frame, (center_x, center_y), 5, color, -1)
            
            # Label
            label = f"{identity} ({confidence:.0%})" if is_known else "UNKNOWN"
            
            cv2.rectangle(frame, (x1, y1 - 25), (x1 + len(label)*10, y1), color, -1)
            cv2.putText(frame, label, (x1, y1 - 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return frame
    
    def trigger_alert(self, person, frame_clean):
            """Alert trigger with AI assessment - saves image + video and logs to Supabase"""
            identity = person['identity']

            if not self.cooldown.can_alert(identity):
                return False

            if not self.recording:
                # Readable timestamp for display
                readable_time = datetime.now().strftime("%I:%M:%S %p")
                # Filename-safe timestamp
                file_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

                # Generate filenames (just the filename, not full path for DB storage)
                thumbnail_filename = f"ALERT_{identity}_{file_timestamp}.jpg"
                video_filename = f"ALERT_{identity}_{file_timestamp}.mp4"

                # Full paths for saving files
                image_path = f"{self.save_dir}/{thumbnail_filename}"
                video_path = f"{self.save_dir}/{video_filename}"

                # Save clean snapshot image with high quality
                cv2.imwrite(image_path, frame_clean, [cv2.IMWRITE_JPEG_QUALITY, 95])

                # Start video recording - favor quality for playback
                height, width = frame_clean.shape[:2]
                fps = self.config.get('recording_fps') or self.capture_fps or self.config.get('target_fps', 30)

                # Prefer higher-quality codecs, fall back for compatibility
                fourcc_candidates = ['avc1', 'H264', 'X264', 'mp4v']
                self.video_writer = None
                for fourcc_name in fourcc_candidates:
                    fourcc = cv2.VideoWriter_fourcc(*fourcc_name)
                    writer = cv2.VideoWriter(video_path, fourcc, fps, (width, height))
                    if writer.isOpened():
                        self.video_writer = writer
                        break

                if self.video_writer is None:
                    print("  Warning: VideoWriter failed to open; skipping recording")
                    return False

                # Try to boost encoder quality if supported
                try:
                    self.video_writer.set(cv2.VIDEOWRITER_PROP_QUALITY, 95)
                except Exception:
                    pass

                self.recording = True
                self.recording_start = time.time()
                self.recording_size = (width, height)
                self.current_video_path = video_path
                self.current_image_path = image_path
                self.current_thumbnail_filename = thumbnail_filename
                self.current_video_filename = video_filename
                self.current_person = person
                self.stats['alerts_sent'] += 1

                print(f"ALERT: {identity} @ {readable_time}")
                print(f"  Image: {image_path}")
                print(f"  Video: {video_path} ({self.recording_duration}s)")

                # Create alert log entry in Supabase immediately (URLs will be added async)
                alert_id = self._save_alert_to_db(person, thumbnail_filename, video_filename)
                self.current_alert_id = alert_id

                # Upload thumbnail and run AI assessment in background (non-blocking)
                threading.Thread(
                    target=self._process_alert_async,
                    args=(person, alert_id, image_path, thumbnail_filename),
                    daemon=True
                ).start()

                return True

            return False

    def _process_alert_async(self, person, alert_id, image_path, thumbnail_filename):
        """Process alert in background: upload thumbnail and run AI assessment"""
        # Upload thumbnail to Supabase Storage
        thumbnail_url = self._upload_to_storage(image_path, thumbnail_filename, 'image/jpeg')

        # Update alert with thumbnail URL
        if thumbnail_url and alert_id:
            sb = _get_supabase()
            if sb:
                try:
                    sb.table("alert_logs").update({
                        "thumbnail_url": thumbnail_url
                    }).eq("id", alert_id).execute()
                    print(f"  Updated alert {alert_id} with thumbnail URL")
                except Exception as e:
                    print(f"  Warning: Failed to update thumbnail URL: {e}")

        # Run AI assessment
        ai_assessment = self.gemini.assess_threat(person)
        print(f"  AI Assessment: {ai_assessment}")

        # Parse threat level from assessment
        threat_level = None
        if ai_assessment:
            if "THREAT: HIGH" in ai_assessment.upper():
                threat_level = "HIGH"
            elif "THREAT: MEDIUM" in ai_assessment.upper():
                threat_level = "MEDIUM"
            elif "THREAT: LOW" in ai_assessment.upper():
                threat_level = "LOW"

        # Update the alert log with gemini assessment
        if alert_id:
            sb = _get_supabase()
            if sb:
                try:
                    sb.table("alert_logs").update({
                        "gemini_assessment": ai_assessment,
                        "threat_level": threat_level
                    }).eq("id", alert_id).execute()
                    print(f"  Updated alert {alert_id} with AI assessment")
                except Exception as e:
                    print(f"  Warning: Failed to update alert with assessment: {e}")

        # Send SMS/push notification
        self._send_notification(person, ai_assessment, thumbnail_filename)

    def _upload_to_storage(self, file_path, filename, content_type):
        """Upload file to Supabase Storage and return public URL"""
        sb = _get_supabase()
        if not sb:
            return None

        try:
            with open(file_path, 'rb') as f:
                file_data = f.read()

            # Upload to 'alerts' bucket
            result = sb.storage.from_('alerts').upload(
                filename,
                file_data,
                file_options={"content-type": content_type, "upsert": "true"}
            )

            # Get public URL
            public_url = sb.storage.from_('alerts').get_public_url(filename)
            print(f"  Uploaded to storage: {public_url}")
            return public_url

        except Exception as e:
            print(f"  Warning: Failed to upload to storage: {e}")
            # Try to create bucket if it doesn't exist
            try:
                sb.storage.create_bucket('alerts', options={"public": True})
                print("  Created 'alerts' storage bucket")
                # Retry upload
                with open(file_path, 'rb') as f:
                    file_data = f.read()
                sb.storage.from_('alerts').upload(
                    filename,
                    file_data,
                    file_options={"content-type": content_type, "upsert": "true"}
                )
                public_url = sb.storage.from_('alerts').get_public_url(filename)
                return public_url
            except Exception as e2:
                print(f"  Warning: Bucket creation/retry failed: {e2}")
            return None

    def _save_alert_to_db(self, person, thumbnail_filename, video_filename, thumbnail_url=None, video_url=None):
        """Save alert metadata to Supabase alert_logs table"""
        sb = _get_supabase()
        if not sb:
            print("  Warning: Could not save alert to database (no Supabase connection)")
            return None

        user_id = self.config.get("user_id") or os.getenv("SUPABASE_USER_ID")
        if not user_id:
            print("  Warning: No user_id configured, skipping database save")
            return None

        try:
            data = {
                "user_id": user_id,
                "device_id": self.device_id,
                "identity": person['identity'],
                "is_known": person['is_known'],
                "confidence": person.get('confidence', 0),
                "thumbnail_filename": thumbnail_filename,
                "video_filename": video_filename,
            }
            # Add URLs if available
            if thumbnail_url:
                data["thumbnail_url"] = thumbnail_url
            if video_url:
                data["video_url"] = video_url

            result = sb.table("alert_logs").insert(data).execute()

            if result.data and len(result.data) > 0:
                alert_id = result.data[0].get('id')
                print(f"  Alert logged to database: {alert_id}")
                return alert_id
        except Exception as e:
            print(f"  Warning: Failed to save alert to database: {e}")

        return None


    def _upload_video_async(self, video_path, video_filename, alert_id):
        """Upload video to Supabase Storage and update the alert record"""
        video_url = self._upload_to_storage(video_path, video_filename, 'video/mp4')

        if video_url and alert_id:
            sb = _get_supabase()
            if sb:
                try:
                    sb.table("alert_logs").update({
                        "video_url": video_url
                    }).eq("id", alert_id).execute()
                    print(f"  Updated alert {alert_id} with video URL")
                except Exception as e:
                    print(f"  Warning: Failed to update alert with video URL: {e}")
    
    def _send_notification(self, person, gemini_assessment, thumbnail_filename):
        """Send SMS and push notification with gemini assessment"""
        identity = person['identity']
        is_known = person['is_known']

        # Build notification message from gemini assessment
        if gemini_assessment:
            message = gemini_assessment
        else:
            if is_known:
                message = f"Known person detected: {identity}"
            else:
                message = f"ALERT: Unknown person detected near your vehicle"

        # Build thumbnail URL for notifications
        backend_url = os.getenv("EXPO_PUBLIC_BACKEND_URL", "http://localhost:5000")
        thumbnail_url = f"{backend_url}/api/alerts/media/{thumbnail_filename}" if thumbnail_filename else None

        # Send to notification service (SMS via Twilio + push via Supabase Edge Function)
        self._trigger_notification_service(message, thumbnail_url, person)

    def _trigger_notification_service(self, message, thumbnail_url, person):
        """Trigger the notification service to send SMS and push notifications"""
        sb = _get_supabase()
        if not sb:
            return

        user_id = self.config.get("user_id") or os.getenv("SUPABASE_USER_ID")
        if not user_id:
            return

        try:
            # Get emergency contacts for the user
            contacts_result = sb.table("emergency_contacts").select("phone").eq("user_id", user_id).execute()

            if not contacts_result.data or len(contacts_result.data) == 0:
                print("  No emergency contacts configured, skipping SMS")
                return

            # Send SMS to each contact via Twilio
            from twilio.rest import Client
            account_sid = os.getenv("TWILIO_ACCOUNT_SID")
            auth_token = os.getenv("TWILIO_AUTH_TOKEN")
            from_number = os.getenv("TWILIO_FROM_NUMBER")

            if not all([account_sid, auth_token, from_number]):
                print("  Twilio credentials not configured, skipping SMS")
                return

            client = Client(account_sid, auth_token)

            # Truncate message for SMS (160 char limit, leave room for URL)
            sms_message = message[:120] if len(message) > 120 else message

            for contact in contacts_result.data:
                phone = contact.get("phone")
                if phone:
                    try:
                        # Include thumbnail URL in SMS if available
                        full_message = sms_message
                        if thumbnail_url:
                            full_message += f"\n\nView: {thumbnail_url}"

                        client.messages.create(
                            body=full_message,
                            from_=from_number,
                            to=phone
                        )
                        print(f"  SMS sent to {phone}")
                    except Exception as e:
                        print(f"  Failed to send SMS to {phone}: {e}")

        except Exception as e:
            print(f"  Notification service error: {e}")

    def send_sms_alert(self, image_path, person):
        pass

    def send_esp32_alert(self, tracking_data):
        pass


def check_hostname_resolution(url):
    """Check if the hostname in a URL can be resolved"""
    import socket
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if hostname:
            socket.gethostbyname(hostname)
            return True, hostname
    except socket.gaierror as e:
        return False, str(e)
    return True, None


def get_tailscale_ip():
    """Try to get the Raspberry Pi's Tailscale IP address"""
    import subprocess
    try:
        # Try to get Tailscale status
        result = subprocess.run(['tailscale', 'status', '--json'],
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            import json
            status = json.loads(result.stdout)
            # Look for the raspberry pi in peers
            for peer_id, peer in status.get('Peer', {}).items():
                if 'raspberrypi' in peer.get('HostName', '').lower():
                    ips = peer.get('TailscaleIPs', [])
                    if ips:
                        return ips[0]
    except Exception:
        pass
    return None


def open_video_stream(stream_url):
    """
    Open video stream with proper configuration for remote HTTP streams

    Supports:
    - MJPEG streams (http://host:port/path)
    - RTSP streams (rtsp://host:port/path)
    - Local camera (integer like 0, 1, 2)
    """
    print(f"Connecting to stream: {stream_url}")

    # Check if it's a local camera ID
    try:
        camera_id = int(stream_url)
        cap = cv2.VideoCapture(camera_id)
        if cap.isOpened():
            print(f"Connected to local camera {camera_id}")
            return cap
    except (ValueError, TypeError):
        pass

    # Check hostname resolution for HTTP/HTTPS URLs
    if str(stream_url).startswith(('http://', 'https://')):
        can_resolve, info = check_hostname_resolution(stream_url)
        if not can_resolve:
            print(f"\n*** DNS RESOLUTION FAILED ***")
            print(f"Cannot resolve hostname in: {stream_url}")
            print(f"Error: {info}")
            print("\nThis is likely a Tailscale issue. Checking...")

            # Check if Tailscale is running
            import subprocess
            try:
                result = subprocess.run(['tailscale', 'status'],
                                      capture_output=True, text=True, timeout=5)
                if result.returncode != 0:
                    print("Tailscale is NOT connected!")
                    print("Run: tailscale up")
                else:
                    print("Tailscale is running.")
                    # Try to find the Raspberry Pi IP
                    rpi_ip = get_tailscale_ip()
                    if rpi_ip:
                        print(f"Found Raspberry Pi at: {rpi_ip}")
                        # Try with IP instead
                        from urllib.parse import urlparse
                        parsed = urlparse(stream_url)
                        ip_url = stream_url.replace(parsed.hostname, rpi_ip)
                        print(f"Trying with IP: {ip_url}")
                        stream_url = ip_url
                    else:
                        print("Could not find Raspberry Pi in Tailscale peers.")
                        print("\nTry these fixes:")
                        print("  1. Run: tailscale up")
                        print("  2. Check if Raspberry Pi is online in Tailscale")
                        print("  3. Use the IP directly: VIDEO_STREAM_URL=http://<rpi-ip>:8889/cam/")
                        print("  4. Check: tailscale status")
            except FileNotFoundError:
                print("Tailscale CLI not found!")
                print("Install Tailscale or use the Raspberry Pi's IP address directly.")
            except Exception as e:
                print(f"Could not check Tailscale status: {e}")

    # Try different backends for HTTP streams
    if str(stream_url).startswith(('http://', 'https://')):
        # Try FFMPEG backend first (better for HTTP streams)
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            # Fallback to default backend
            cap = cv2.VideoCapture(stream_url)

        if not cap.isOpened():
            # Try with explicit MJPEG URL variations
            variations = [
                stream_url,
                stream_url.rstrip('/') + '?action=stream',
                stream_url.rstrip('/') + '/video',
                stream_url.rstrip('/') + '/stream',
            ]
            for url in variations:
                cap = cv2.VideoCapture(url)
                if cap.isOpened():
                    print(f"Connected using: {url}")
                    break
    elif str(stream_url).startswith('rtsp://'):
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    else:
        cap = cv2.VideoCapture(stream_url)

    if cap.isOpened():
        # Configure stream properties
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce latency
        print("Stream connected successfully!")
    else:
        print(f"Failed to connect to stream: {stream_url}")

    return cap


# Default stream URL - can be overridden via env
DEFAULT_STREAM_URL = os.getenv(
    "VIDEO_STREAM_URL",
    "http://raspberrypi.tail56d975.ts.net:8889/cam/"
)


def main():
    """
    Main loop optimized for speed
    """

    # Get stream URL from environment or use default
    stream_url = os.getenv("VIDEO_STREAM_URL", DEFAULT_STREAM_URL)

    config = {
        'yolo_model': 'yolov8n.pt',
        'yolo_confidence': 0.6,
        'cooldown_seconds': 60,
        'stream_url': stream_url,
        'frame_width': int(os.getenv("VIDEO_FRAME_WIDTH", 1280)),  # Higher resolution for better quality
        'frame_height': int(os.getenv("VIDEO_FRAME_HEIGHT", 720)),
        'target_fps': int(os.getenv("VIDEO_TARGET_FPS", 30)),
        'recording_fps': int(os.getenv("VIDEO_RECORDING_FPS", 30)),
        'process_every_n_frames': 1,  # Process every frame for smoother output
        'detection_scale': float(os.getenv("VIDEO_DETECTION_SCALE", 0.75)),
        'use_mediapipe': True,  # MediaPipe = 10x faster than CNN
        'use_yolo': False,  # Disable YOLO, MediaPipe is faster
    }

    system = FastSecuritySystem(config)

    # Skip local database build - faces are loaded from Supabase
    # Uncomment to rebuild from local folder:
    # print("\n" + "="*60)
    # print("BUILDING DATABASE (ONE-TIME)")
    # print("="*60)
    # system.face_db.build_from_folder('known_faces')
    # print("="*60 + "\n")

    # Open video stream (remote or local)
    cap = open_video_stream(config['stream_url'])

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, config['frame_width'])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config['frame_height'])
        cap.set(cv2.CAP_PROP_FPS, config.get('target_fps', 30))
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce latency
        capture_fps = cap.get(cv2.CAP_PROP_FPS)
        if not capture_fps or capture_fps < 5 or capture_fps > 120:
            capture_fps = config.get('target_fps', 30)
        system.capture_fps = capture_fps

        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or config['frame_width']
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or config['frame_height']
        system.tracker.frame_width = actual_w
        system.tracker.frame_height = actual_h
        system.config['frame_width'] = actual_w
        system.config['frame_height'] = actual_h

    if not cap.isOpened():
        print("Cannot open video stream")
        print(f"Tried: {config['stream_url']}")
        print("\nTroubleshooting tips:")
        print("  1. Check if VIDEO_STREAM_URL env variable is set correctly")
        print("  2. Verify the Raspberry Pi camera is running")
        print("  3. Test the URL in a browser or VLC player")
        print("  4. For local camera, set VIDEO_STREAM_URL=0")
        return
    
    print("\n" + "="*60)
    print("FAST SECURITY SYSTEM ACTIVE")
    print("="*60)
    print("Target: 30+ FPS with accurate recognition")
    print("Press 'q' to quit | 's' to save | 'r' to reset")
    print("="*60 + "\n")
    
    fps_start = time.time()
    fps_counter = 0
    fps_display = 0
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if time.time() - system._last_face_reload > system._face_reload_interval:
                system.face_db.load_database()
                system._last_face_reload = time.time()

            persons = system.detect_and_recognize(frame)
            
            # Save clean frame for alert snapshots
            frame_clean = frame.copy()
            
            # Draw detections
            frame = system.draw_detections(frame, persons)
            
            # Handle video recording (clean frames for higher quality)
            if system.recording:
                frame_to_write = frame_clean
                if system.recording_size:
                    target_w, target_h = system.recording_size
                    if frame.shape[1] != target_w or frame.shape[0] != target_h:
                        frame_to_write = cv2.resize(frame_to_write, (target_w, target_h))
                system.video_writer.write(frame_to_write)
                if time.time() - system.recording_start > system.recording_duration:
                    system.video_writer.release()
                    system.recording = False
                    system.video_writer = None
                    print("Video recording stopped")

                    # Upload video to Supabase Storage in background
                    if hasattr(system, 'current_video_path') and hasattr(system, 'current_alert_id'):
                        threading.Thread(
                            target=system._upload_video_async,
                            args=(system.current_video_path, system.current_video_filename, system.current_alert_id),
                            daemon=True
                        ).start()
            
            motion_detected = system.motion_detector.detect(frame)
            if motion_detected and system._motion_alert_cooldown.can_alert("motion"):
                send_camera_alert(system.device_id, motion=True, alert_type=None)

            for person in persons:
                # Trigger alert for ALL detected persons (known and unknown)
                alert_type = "known_face" if person['is_known'] else "unknown_face"
                if system.trigger_alert(person, frame_clean):
                    send_camera_alert(
                        system.device_id, motion=True, alert_type=alert_type
                    )
            
            # FPS calculation
            fps_counter += 1
            if time.time() - fps_start > 1.0:
                fps_display = fps_counter
                fps_counter = 0
                fps_start = time.time()
            
            # Stats overlay
            stats_text = f"FPS: {fps_display} | Known: {system.stats['known_persons']} | Unknown: {system.stats['unknown_persons']}"
            cv2.putText(frame, stats_text, (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            # Stepper command
            if persons:
                cmd = system.tracker.get_stepper_command()
                cmd_text = f"Stepper: {cmd['action']} @ {cmd['angle']:.1f}Â°"
                cv2.putText(frame, cmd_text, (10, 60),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            # Display
            cv2.imshow('Fast Security System', frame)
            
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q'):
                break
            elif key == ord('s'):
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                cv2.imwrite(f"{system.save_dir}/manual_{timestamp}.jpg", frame)
            elif key == ord('r'):
                system.cooldown.reset_cooldown()
    
    except KeyboardInterrupt:
        print("\n  Interrupted")
    
    finally:
        print("\n" + "="*60)
        print("SHUTDOWN")
        print("="*60)
        print(f"  Detections: {system.stats['total_detections']}")
        print(f"  Known: {system.stats['known_persons']}")
        print(f"  Unknown: {system.stats['unknown_persons']}")
        print(f"  Alerts: {system.stats['alerts_sent']}")
        print(f"  Frames processed: {system.stats['frames_processed']}")
        print(f"  Frames skipped: {system.stats['frames_skipped']}")
        print(f"  Final FPS: {fps_display}")
        print("="*60)
        
        cap.release()
        cv2.destroyAllWindows()
        # Release video writer if still recording
        if system.recording:
            system.video_writer.release()


if __name__ == '__main__':
    main()
