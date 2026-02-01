import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import face_recognition
import numpy as np

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

_supabase = None

def get_supabase():
    global _supabase
    if _supabase is None:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        _supabase = create_client(url, key)
    return _supabase


@app.route("/api/faces", methods=["POST"])
def add_face():
    user_id = (
        request.headers.get("X-User-Id")
        or (request.json.get("user_id") if request.is_json else None)
        or request.form.get("user_id")
    )
    name = (
        (request.json.get("name") if request.is_json else None)
        or request.form.get("name")
    )
    if not user_id or not name:
        return jsonify({"error": "user_id and name required"}), 400

    if "image" not in request.files and not (request.is_json and request.json.get("image_base64")):
        return jsonify({"error": "image file or image_base64 required"}), 400

    try:
        if "image" in request.files:
            f = request.files["image"]
            image = face_recognition.load_image_file(f)
        else:
            import base64
            b64 = request.json["image_base64"]
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            raw = base64.b64decode(b64)
            nparr = np.frombuffer(raw, np.uint8)
            import cv2
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        locations = face_recognition.face_locations(image, model="hog")
        if not locations:
            return jsonify({"error": "No face detected"}), 400

        encodings = face_recognition.face_encodings(image, locations, num_jitters=2)
        if not encodings:
            return jsonify({"error": "Could not encode face"}), 400

        encoding = encodings[0].tolist()
        sb = get_supabase()
        sb.table("familiar_faces").insert({
            "user_id": user_id,
            "name": name,
            "encoding": encoding,
        }).execute()

        return jsonify({"ok": True, "name": name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/faces", methods=["GET"])
def list_faces():
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        sb = get_supabase()
        r = sb.table("familiar_faces").select("id, name, created_at").eq("user_id", user_id).execute()
        return jsonify({"faces": r.data or []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/faces/<face_id>", methods=["DELETE"])
def delete_face(face_id):
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        sb = get_supabase()
        sb.table("familiar_faces").delete().eq("id", face_id).eq("user_id", user_id).execute()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


# Default stream URL for remote capture
DEFAULT_STREAM_URL = os.getenv(
    "VIDEO_STREAM_URL",
    "http://raspberrypi.tail56d975.ts.net:8889/cam/"
)


def open_video_stream(stream_url):
    """Open video stream with proper configuration for remote HTTP streams"""
    import cv2

    # Check if it's a local camera ID
    try:
        camera_id = int(stream_url)
        cap = cv2.VideoCapture(camera_id)
        if cap.isOpened():
            return cap
    except (ValueError, TypeError):
        pass

    # Try different backends for HTTP streams
    if str(stream_url).startswith(('http://', 'https://')):
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            cap = cv2.VideoCapture(stream_url)

        if not cap.isOpened():
            variations = [
                stream_url,
                stream_url.rstrip('/') + '?action=stream',
                stream_url.rstrip('/') + '/video',
                stream_url.rstrip('/') + '/stream',
            ]
            for url in variations:
                cap = cv2.VideoCapture(url)
                if cap.isOpened():
                    break
    elif str(stream_url).startswith('rtsp://'):
        cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
    else:
        cap = cv2.VideoCapture(stream_url)

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    return cap


@app.route("/api/faces/capture", methods=["POST"])
def capture_face_from_stream():
    """
    Capture a face directly from the Raspberry Pi video stream.
    Useful for remote capture from the mobile app.

    Request body:
    {
        "user_id": "uuid",
        "name": "Person Name",
        "stream_url": "optional - defaults to env VIDEO_STREAM_URL"
    }
    """
    import cv2

    user_id = (
        request.headers.get("X-User-Id")
        or (request.json.get("user_id") if request.is_json else None)
    )
    name = request.json.get("name") if request.is_json else None
    stream_url = request.json.get("stream_url") if request.is_json else None

    if not user_id or not name:
        return jsonify({"error": "user_id and name required"}), 400

    if not stream_url:
        stream_url = DEFAULT_STREAM_URL

    try:
        cap = open_video_stream(stream_url)

        if not cap.isOpened():
            return jsonify({"error": f"Cannot connect to stream: {stream_url}"}), 500

        # Capture a few frames to let camera adjust
        for _ in range(5):
            cap.read()

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return jsonify({"error": "Failed to capture frame from stream"}), 500

        # Convert BGR to RGB for face_recognition
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Detect face
        locations = face_recognition.face_locations(rgb_frame, model="hog")
        if not locations:
            return jsonify({"error": "No face detected in stream. Position yourself in front of the camera."}), 400

        # Encode face
        encodings = face_recognition.face_encodings(rgb_frame, locations, num_jitters=2)
        if not encodings:
            return jsonify({"error": "Could not encode face"}), 400

        encoding = encodings[0].tolist()

        # Save to Supabase
        sb = get_supabase()
        sb.table("familiar_faces").insert({
            "user_id": user_id,
            "name": name,
            "encoding": encoding,
        }).execute()

        return jsonify({"ok": True, "name": name, "message": "Face captured from stream and saved"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stream/test", methods=["GET"])
def test_stream():
    """Test if the video stream is accessible"""
    import cv2

    stream_url = request.args.get("url") or DEFAULT_STREAM_URL

    try:
        cap = open_video_stream(stream_url)

        if not cap.isOpened():
            return jsonify({
                "ok": False,
                "error": "Cannot connect to stream",
                "stream_url": stream_url
            }), 500

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return jsonify({
                "ok": False,
                "error": "Connected but cannot read frames",
                "stream_url": stream_url
            }), 500

        return jsonify({
            "ok": True,
            "stream_url": stream_url,
            "frame_width": frame.shape[1],
            "frame_height": frame.shape[0]
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
