import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import face_recognition
import numpy as np

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Detection files directory
DETECTIONS_DIR = os.path.join(os.path.dirname(__file__), "detections")

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


# =============================================================================
# ALERT LOGS API
# =============================================================================

@app.route("/api/alerts", methods=["GET"])
def list_alerts():
    """
    List alert logs for a user with pagination.

    Query params:
    - user_id: required
    - limit: optional (default 20, max 100)
    - offset: optional (default 0)
    - is_known: optional filter (true/false)
    """
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    limit = min(int(request.args.get("limit", 20)), 100)
    offset = int(request.args.get("offset", 0))
    is_known_filter = request.args.get("is_known")

    try:
        sb = get_supabase()
        query = sb.table("alert_logs").select(
            "id, device_id, identity, is_known, confidence, thumbnail_filename, "
            "video_filename, gemini_assessment, threat_level, created_at"
        ).eq("user_id", user_id).order("created_at", desc=True).range(offset, offset + limit - 1)

        if is_known_filter is not None:
            query = query.eq("is_known", is_known_filter.lower() == "true")

        result = query.execute()

        # Add full media URLs to each alert
        backend_url = os.getenv("EXPO_PUBLIC_BACKEND_URL", request.host_url.rstrip('/'))
        alerts = []
        for alert in (result.data or []):
            alert_with_urls = dict(alert)
            if alert.get("thumbnail_filename"):
                alert_with_urls["thumbnail_url"] = f"{backend_url}/api/alerts/media/{alert['thumbnail_filename']}"
            if alert.get("video_filename"):
                alert_with_urls["video_url"] = f"{backend_url}/api/alerts/media/{alert['video_filename']}"
            alerts.append(alert_with_urls)

        return jsonify({"alerts": alerts, "count": len(alerts)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/alerts/<alert_id>", methods=["GET"])
def get_alert(alert_id):
    """Get a single alert by ID"""
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        sb = get_supabase()
        result = sb.table("alert_logs").select("*").eq("id", alert_id).eq("user_id", user_id).single().execute()

        if not result.data:
            return jsonify({"error": "Alert not found"}), 404

        alert = dict(result.data)
        backend_url = os.getenv("EXPO_PUBLIC_BACKEND_URL", request.host_url.rstrip('/'))

        if alert.get("thumbnail_filename"):
            alert["thumbnail_url"] = f"{backend_url}/api/alerts/media/{alert['thumbnail_filename']}"
        if alert.get("video_filename"):
            alert["video_url"] = f"{backend_url}/api/alerts/media/{alert['video_filename']}"

        return jsonify({"alert": alert})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/alerts/<alert_id>", methods=["DELETE"])
def delete_alert(alert_id):
    """Delete an alert and optionally its media files"""
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    delete_files = request.args.get("delete_files", "true").lower() == "true"

    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        sb = get_supabase()

        # Get alert first to find media files
        result = sb.table("alert_logs").select("thumbnail_filename, video_filename").eq("id", alert_id).eq("user_id", user_id).single().execute()

        if not result.data:
            return jsonify({"error": "Alert not found"}), 404

        # Delete media files if requested
        if delete_files:
            if result.data.get("thumbnail_filename"):
                thumbnail_path = os.path.join(DETECTIONS_DIR, result.data["thumbnail_filename"])
                if os.path.exists(thumbnail_path):
                    os.remove(thumbnail_path)
            if result.data.get("video_filename"):
                video_path = os.path.join(DETECTIONS_DIR, result.data["video_filename"])
                if os.path.exists(video_path):
                    os.remove(video_path)

        # Delete from database
        sb.table("alert_logs").delete().eq("id", alert_id).eq("user_id", user_id).execute()

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/alerts/media/<filename>", methods=["GET"])
def serve_alert_media(filename):
    """
    Serve alert media files (images and videos).
    Supports byte-range requests for video streaming.
    """
    # Security: prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        return jsonify({"error": "Invalid filename"}), 400

    file_path = os.path.join(DETECTIONS_DIR, filename)

    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404

    # Determine MIME type
    if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
        mimetype = 'image/jpeg'
    elif filename.lower().endswith('.png'):
        mimetype = 'image/png'
    elif filename.lower().endswith('.mp4'):
        mimetype = 'video/mp4'
    else:
        mimetype = 'application/octet-stream'

    return send_from_directory(DETECTIONS_DIR, filename, mimetype=mimetype)


@app.route("/api/alerts/stats", methods=["GET"])
def get_alert_stats():
    """Get alert statistics for a user"""
    user_id = request.headers.get("X-User-Id") or request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    try:
        sb = get_supabase()

        # Get counts
        total_result = sb.table("alert_logs").select("id", count="exact").eq("user_id", user_id).execute()
        unknown_result = sb.table("alert_logs").select("id", count="exact").eq("user_id", user_id).eq("is_known", False).execute()
        high_threat_result = sb.table("alert_logs").select("id", count="exact").eq("user_id", user_id).eq("threat_level", "HIGH").execute()

        return jsonify({
            "total_alerts": total_result.count or 0,
            "unknown_alerts": unknown_result.count or 0,
            "high_threat_alerts": high_threat_result.count or 0
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
