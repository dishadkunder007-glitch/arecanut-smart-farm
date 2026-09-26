"""
Startup launcher for Arecanut Smart Irrigation & AI Farm Management Dashboard
Runs backend FastAPI server with real-time IoT simulation & static frontend.
"""
import os
import sys
import uvicorn

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(base_dir, "backend")
    sys.path.insert(0, backend_dir)

    print("=" * 70)
    print("ARECANUT SMART IRRIGATION & AI FARM MANAGEMENT DASHBOARD")
    print("=" * 70)
    print("Starting FastAPI Backend + IoT WebSocket Simulator on http://127.0.0.1:8000")
    print("Demo Farmer Credentials:")
    print("  Phone: 9876543210")
    print("  Password: farmer123")
    print("Demo Admin Credentials:")
    print("  Email: admin@areca.farm")
    print("  Password: admin123")
    print("=" * 70)

    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
