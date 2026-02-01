"""
Webcam Training Photo Capture Tool
Captures training photos from remote video stream and uploads to Supabase familiar_faces
"""

import cv2
import os
import sys
import base64
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
import face_recognition

load_dotenv()

# Default stream URL - can be overridden via env or argument
DEFAULT_STREAM_URL = os.getenv(
    "VIDEO_STREAM_URL",
    "http://raspberrypi.tail56d975.ts.net:8889/cam/"
)

_supabase_client = None


def _get_supabase():
    """Lazy-load Supabase client"""
    global _supabase_client
    if _supabase_client is None:
        try:
            from supabase import create_client
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            if url and key:
                _supabase_client = create_client(url, key)
            else:
                print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
        except Exception as e:
            print(f"Supabase init failed: {e}")
    return _supabase_client


def open_video_stream(stream_url):
    """
    Open video stream with proper configuration for remote HTTP streams

    Supports:
    - MJPEG streams (http://host:port/path)
    - RTSP streams (rtsp://host:port/path)
    - Local camera (integer like 0, 1, 2)
    """
    print(f"Connecting to stream: {stream_url}")

    # Try different backends for HTTP streams
    if stream_url.startswith(('http://', 'https://')):
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
    elif stream_url.startswith('rtsp://'):
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    else:
        # Local camera (integer ID)
        try:
            camera_id = int(stream_url)
            cap = cv2.VideoCapture(camera_id)
        except ValueError:
            cap = cv2.VideoCapture(stream_url)

    if cap.isOpened():
        # Configure stream properties
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce latency
        print("Stream connected successfully!")
    else:
        print(f"Failed to connect to stream: {stream_url}")

    return cap


def encode_face_from_frame(frame):
    """
    Detect and encode face from a frame
    Returns (encoding, face_location) or (None, None) if no face found
    """
    # Convert BGR to RGB for face_recognition
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Detect faces using HOG (fast)
    face_locations = face_recognition.face_locations(rgb_frame, model='hog')

    if not face_locations:
        return None, None

    # Get encoding for the first (largest) face
    encodings = face_recognition.face_encodings(rgb_frame, face_locations, num_jitters=2)

    if not encodings:
        return None, None

    return encodings[0], face_locations[0]


def upload_face_to_supabase(name, encoding, user_id):
    """Upload face encoding to Supabase familiar_faces table"""
    sb = _get_supabase()
    if not sb:
        print("Supabase not available")
        return False

    try:
        sb.table("familiar_faces").insert({
            "user_id": user_id,
            "name": name,
            "encoding": encoding.tolist(),
        }).execute()
        return True
    except Exception as e:
        print(f"Upload failed: {e}")
        return False


def draw_face_box(frame, face_location):
    """Draw a box around detected face"""
    if face_location:
        top, right, bottom, left = face_location
        cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
        cv2.putText(frame, "Face detected", (left, top - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    return frame


def capture_training_photos(person_name, user_id, num_photos=5, stream_url=None, save_local=False):
    """
    Capture training photos from video stream and upload to Supabase

    Args:
        person_name: Name of the person
        user_id: Supabase user ID for the familiar_faces table
        num_photos: Number of photos/encodings to capture
        stream_url: Video stream URL (defaults to env/Raspberry Pi stream)
        save_local: Also save photos locally for backup
    """
    if stream_url is None:
        stream_url = DEFAULT_STREAM_URL

    # Optional local backup
    output_dir = None
    if save_local:
        output_dir = f"known_faces/{person_name}"
        os.makedirs(output_dir, exist_ok=True)

    print("\n" + "="*70)
    print("FACE CAPTURE - Remote Stream")
    print("="*70)
    print(f"Person: {person_name}")
    print(f"User ID: {user_id[:8]}..." if user_id else "No user ID")
    print(f"Target photos: {num_photos}")
    print(f"Stream: {stream_url}")
    print("="*70)
    print("\nINSTRUCTIONS:")
    print("  1. Position yourself in front of the camera")
    print("  2. Ensure good lighting on your face")
    print("  3. Press SPACE when a green box appears on your face")
    print("  4. Vary your angle slightly between captures:")
    print("     - Look slightly left/right")
    print("     - Tilt head slightly")
    print("     - Different expressions (neutral, smile)")
    print("  5. Press 'q' when done")
    print("="*70 + "\n")

    input("Press ENTER when ready to connect to stream...")

    cap = open_video_stream(stream_url)

    if not cap.isOpened():
        print("Cannot open video stream")
        print("\nTroubleshooting tips:")
        print("  1. Check if the stream URL is correct")
        print("  2. Verify the Raspberry Pi camera is running")
        print("  3. Test the URL in a browser or VLC player")
        print("  4. Check network connectivity to the Raspberry Pi")
        return

    count = 0
    uploaded_count = 0

    angles = [
        "Center (straight ahead)",
        "Slight left turn",
        "Slight right turn",
        "Tilt head slightly",
        "Center (smile)",
    ]

    print("\nStream active!")
    print("  Press SPACE to capture when face is detected")
    print("  Press 'q' to finish\n")

    while count < num_photos:
        ret, frame = cap.read()
        if not ret:
            print("Failed to read frame, retrying...")
            continue

        display_frame = frame.copy()

        # Detect face for preview
        _, face_location = encode_face_from_frame(frame)

        # Draw face box if detected
        if face_location:
            display_frame = draw_face_box(display_frame, face_location)
            status_color = (0, 255, 0)
            status_text = "FACE DETECTED - Press SPACE"
        else:
            status_color = (0, 0, 255)
            status_text = "No face - adjust position"

        # Top banner
        cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], 100), (0, 0, 0), -1)

        # Photo count
        cv2.putText(display_frame, f"Photos: {count}/{num_photos}", (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        # Status
        cv2.putText(display_frame, status_text, (10, 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)

        # Suggestion
        if count < len(angles):
            suggestion = f"Try: {angles[count]}"
        else:
            suggestion = "Keep varying angle"
        cv2.putText(display_frame, suggestion, (10, 90),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow('Face Capture - Remote Stream', display_frame)

        key = cv2.waitKey(1) & 0xFF

        if key == ord(' '):  # Space bar
            if face_location is None:
                print("No face detected - move closer or adjust lighting")
                continue

            # Get face encoding
            encoding, _ = encode_face_from_frame(frame)

            if encoding is None:
                print("Could not encode face - try again")
                continue

            count += 1

            # Upload to Supabase
            if user_id:
                if upload_face_to_supabase(person_name, encoding, user_id):
                    uploaded_count += 1
                    print(f"[{count:2d}/{num_photos}] Captured & uploaded!")
                else:
                    print(f"[{count:2d}/{num_photos}] Captured (upload failed)")
            else:
                print(f"[{count:2d}/{num_photos}] Captured (no user_id for upload)")

            # Optional local save
            if save_local and output_dir:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{output_dir}/photo_{count:02d}_{timestamp}.jpg"
                cv2.imwrite(filename, frame)

            # Brief pause to avoid double-capture
            cv2.waitKey(300)

        elif key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    print("\n" + "="*70)
    print("CAPTURE COMPLETE")
    print("="*70)
    print(f"Total photos: {count}")
    print(f"Uploaded to Supabase: {uploaded_count}")
    if save_local and output_dir:
        print(f"Local backup: {output_dir}/")
    print("\nThe face database will be automatically loaded by the security system.")
    print("="*70 + "\n")


def capture_single_photo(person_name, user_id, stream_url=None):
    """
    Quick capture: Take a single photo and upload to Supabase
    Useful for the mobile app to trigger remote capture
    """
    if stream_url is None:
        stream_url = DEFAULT_STREAM_URL

    cap = open_video_stream(stream_url)

    if not cap.isOpened():
        return {"ok": False, "error": "Cannot open video stream"}

    # Capture a few frames to let camera adjust
    for _ in range(5):
        cap.read()

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return {"ok": False, "error": "Failed to capture frame"}

    # Encode face
    encoding, face_location = encode_face_from_frame(frame)

    if encoding is None:
        return {"ok": False, "error": "No face detected in frame"}

    # Upload to Supabase
    if upload_face_to_supabase(person_name, encoding, user_id):
        return {"ok": True, "name": person_name}
    else:
        return {"ok": False, "error": "Failed to upload to Supabase"}


def list_familiar_faces(user_id):
    """List all familiar faces for a user from Supabase"""
    sb = _get_supabase()
    if not sb:
        print("Supabase not available")
        return []

    try:
        result = sb.table("familiar_faces").select("id, name, created_at").eq("user_id", user_id).execute()
        return result.data or []
    except Exception as e:
        print(f"Failed to list faces: {e}")
        return []


def review_photos(person_name):
    """
    Review captured photos (local backup only)
    """
    folder = f"known_faces/{person_name}"

    if not os.path.exists(folder):
        print(f"Folder not found: {folder}")
        return

    photos = [f for f in os.listdir(folder) if f.endswith(('.jpg', '.jpeg', '.png'))]

    if not photos:
        print(f"No photos found in {folder}")
        return

    print(f"\nReviewing {len(photos)} photos for {person_name}")
    print("Press 'n' for next, 'd' to delete, 'q' to quit\n")

    idx = 0

    while idx < len(photos):
        photo_path = os.path.join(folder, photos[idx])
        img = cv2.imread(photo_path)

        if img is None:
            print(f"Could not load {photos[idx]}")
            idx += 1
            continue

        # Display
        display = img.copy()
        cv2.putText(display, f"{idx+1}/{len(photos)}: {photos[idx]}", (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(display, "N=Next | D=Delete | Q=Quit", (10, 460),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow('Review Photos', display)

        key = cv2.waitKey(0) & 0xFF

        if key == ord('n'):
            idx += 1
        elif key == ord('d'):
            os.remove(photo_path)
            print(f"Deleted: {photos[idx]}")
            photos.pop(idx)
        elif key == ord('q'):
            break

    cv2.destroyAllWindows()
    print(f"\nReview complete. {len(photos)} photos remaining")


def test_stream_connection(stream_url=None):
    """Test if the video stream is accessible"""
    if stream_url is None:
        stream_url = DEFAULT_STREAM_URL

    print(f"Testing connection to: {stream_url}")

    cap = open_video_stream(stream_url)

    if not cap.isOpened():
        print("FAILED: Cannot connect to stream")
        return False

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        print("FAILED: Connected but cannot read frames")
        return False

    print(f"SUCCESS: Stream is working!")
    print(f"  Frame size: {frame.shape[1]}x{frame.shape[0]}")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("\nUsage:")
        print("  python webcam_capture.py <person_name> [num_photos] [--local]")
        print("  python webcam_capture.py --test              # Test stream connection")
        print("  python webcam_capture.py --list <user_id>    # List familiar faces")
        print("\nExamples:")
        print("  python webcam_capture.py John 5")
        print("  python webcam_capture.py 'Jane Smith' 10 --local")
        print("\nEnvironment variables:")
        print("  VIDEO_STREAM_URL - Stream URL (default: Raspberry Pi)")
        print("  SUPABASE_URL - Supabase project URL")
        print("  SUPABASE_SERVICE_ROLE_KEY - Supabase service key")
        print("  SUPABASE_USER_ID - Your user ID for storing faces")
        print()

        # Interactive mode
        if '--test' in sys.argv:
            test_stream_connection()
            sys.exit(0)

        if '--list' in sys.argv:
            idx = sys.argv.index('--list')
            if idx + 1 < len(sys.argv):
                user_id = sys.argv[idx + 1]
            else:
                user_id = os.getenv("SUPABASE_USER_ID")

            if not user_id:
                print("User ID required")
                sys.exit(1)

            faces = list_familiar_faces(user_id)
            print(f"\nFamiliar faces for user {user_id[:8]}...:")
            for face in faces:
                print(f"  - {face['name']} (id: {face['id'][:8]}...)")
            sys.exit(0)

        # Test connection first
        print("Testing stream connection...")
        if not test_stream_connection():
            print("\nStream not available. Check your configuration.")
            sys.exit(1)

        person_name = input("\nEnter person name: ").strip()
        if not person_name:
            print("Name required")
            sys.exit(1)

        try:
            num_photos = int(input("Number of photos (default 5): ") or "5")
        except:
            num_photos = 5

        user_id = os.getenv("SUPABASE_USER_ID")
        if not user_id:
            user_id = input("Enter Supabase user ID: ").strip()

        save_local = input("Save local backup? (y/n, default n): ").strip().lower() == 'y'

    else:
        if sys.argv[1] == '--test':
            test_stream_connection()
            sys.exit(0)

        if sys.argv[1] == '--list':
            user_id = sys.argv[2] if len(sys.argv) > 2 else os.getenv("SUPABASE_USER_ID")
            if not user_id:
                print("User ID required")
                sys.exit(1)
            faces = list_familiar_faces(user_id)
            print(f"\nFamiliar faces for user {user_id[:8]}...:")
            for face in faces:
                print(f"  - {face['name']} (id: {face['id'][:8]}...)")
            sys.exit(0)

        person_name = sys.argv[1]
        num_photos = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 5
        user_id = os.getenv("SUPABASE_USER_ID")
        save_local = '--local' in sys.argv

    # Capture photos
    capture_training_photos(person_name, user_id, num_photos, save_local=save_local)

    # Offer review if local copies exist
    if save_local:
        review = input("\nReview photos? (y/n): ").strip().lower()
        if review == 'y':
            review_photos(person_name)
