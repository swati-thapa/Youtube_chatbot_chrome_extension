# app.py
import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from routes.ask import ask_blueprint

load_dotenv()
EXT_ID = os.getenv("EXTENSION_ID")

app = Flask(__name__)

# --- CORS: allow only your extension + local dev to hit /ask ---
CORS(
    app,
    resources={
        r"/ask": {
            "origins": [
                f"chrome-extension://{EXT_ID}",  # <-- replace this
                "http://localhost",
                "http://127.0.0.1",
                "http://localhost:3000",
                "http://127.0.0.1:5500",
            ],
            "allow_headers": ["Content-Type", "X-Access-Code"],
        },
        r"/": {"origins": "*"},  # health root
    },
)

ACCESS_CODE = os.getenv("ACCESS_CODE")  # e.g. ACCESS_CODE=super-secret-code

@app.before_request
def log_every_request():
    print(f"Incoming request to: {request.path}")

# --- Access code gate for /ask ---
@app.before_request
def require_access_code():
    # Allow health root and static files
    if request.path == "/" or request.method == "OPTIONS":
        return

    # Protect /ask (and any future API routes you add)
    if request.path.startswith("/ask"):
        # If no ACCESS_CODE set, skip check (dev convenience)
        if not ACCESS_CODE:
            return
        sent_code = request.headers.get("X-Access-Code", "")
        if sent_code != ACCESS_CODE:
            return jsonify({"error": "Forbidden"}), 403

@app.route("/")
def home():
    return "YouTube chatbot backend is running!"

# Register routes
app.register_blueprint(ask_blueprint)

if __name__ == "__main__":
    # Optional: limit request size (safety)
    # app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB
    app.run(debug=True)
