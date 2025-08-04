from flask import Flask, request
from flask_cors import CORS
from routes.ask import ask_blueprint
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

@app.before_request
def log_every_request():
    print(f"Incoming request to: {request.path}")

@app.route("/")
def home():
    return "YouTube chatbot backend is running!"

app.register_blueprint(ask_blueprint)

if __name__ == "__main__":
    app.run(debug=True)
