import os
import sys

# Ensure backend directory is in the Python search path for module imports
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CURRENT_DIR)
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Expose the FastAPI ASGI application for Vercel Serverless Functions
from app import app
