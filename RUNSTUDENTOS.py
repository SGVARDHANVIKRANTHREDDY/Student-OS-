#!/usr/bin/env python3
"""
Student OS System Launcher - Enhanced Version
Starts backend, frontend, seeds admin user, and opens browser
NO external dependencies required (uses urllib instead of requests)
"""

import os
import sys
import subprocess
import time
import json
import signal
import atexit
import webbrowser
from pathlib import Path
from typing import Optional
from urllib.request import urlopen
from urllib.error import URLError

# Configuration
BACKEND_URL = "http://127.0.0.1:5000"
FRONTEND_URL = "http://localhost:3000"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Admin123@45"
ADMIN_USERNAME = "Admin"

# Color codes for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# Store process handles for cleanup
processes = []

def log_info(message: str):
    """Log info message"""
    print(f"{Colors.OKBLUE}ℹ️  {message}{Colors.ENDC}")

def log_success(message: str):
    """Log success message"""
    print(f"{Colors.OKGREEN}✅ {message}{Colors.ENDC}")

def log_warning(message: str):
    """Log warning message"""
    print(f"{Colors.WARNING}⚠️  {message}{Colors.ENDC}")

def log_error(message: str):
    """Log error message"""
    print(f"{Colors.FAIL}❌ {message}{Colors.ENDC}")

def log_header(message: str):
    """Log header message"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{message:^70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}{'='*70}{Colors.ENDC}\n")

def cleanup():
    """Clean up processes on exit"""
    log_info("Cleaning up processes...")
    for process in processes:
        try:
            if process.poll() is None:  # Process still running
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
        except Exception:
            pass
    log_success("Cleanup complete")

def verify_npm_available() -> bool:
    """Verify npm is installed and available"""
    try:
        result = subprocess.run(
            "npm --version" if sys.platform == "win32" else ["npm", "--version"],
            shell=True if sys.platform == "win32" else False,
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            log_success(f"npm is available (version {version})")
            return True
        else:
            log_error("npm is installed but not responding correctly")
            return False
    except Exception as e:
        log_error(f"npm is not available: {e}")
        log_error("Please install Node.js from https://nodejs.org")
        log_error("Make sure npm is added to PATH during installation")
        return False

def start_backend() -> Optional[subprocess.Popen]:
    """Start the backend server"""
    log_info("Starting backend server...")
    
    backend_path = Path(__file__).parent / "backend"
    
    if not backend_path.exists():
        log_error(f"Backend directory not found: {backend_path}")
        return None
    
    try:
        # Create environment with PG_DISABLED flag
        env = os.environ.copy()
        env["PG_DISABLED"] = "1"
        env["NODE_ENV"] = "development"
        
        # Use shell=True on Windows to find npm in PATH
        cmd = "npm run dev"
        if sys.platform == "win32":
            process = subprocess.Popen(
                cmd,
                shell=True,
                cwd=str(backend_path),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        else:
            process = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(backend_path),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        
        processes.append(process)
        log_success("Backend process started (PID: {})".format(process.pid))
        return process
    except Exception as e:
        log_error(f"Failed to start backend: {e}")
        log_error("Make sure Node.js and npm are installed and in PATH")
        log_error("Install from: https://nodejs.org")
        return None

def start_frontend() -> Optional[subprocess.Popen]:
    """Start the frontend server"""
    log_info("Starting frontend server...")
    
    frontend_path = Path(__file__).parent / "frontend"
    
    if not frontend_path.exists():
        log_error(f"Frontend directory not found: {frontend_path}")
        return None
    
    try:
        # Use shell=True on Windows to find npm in PATH
        cmd = "npm run dev"
        if sys.platform == "win32":
            process = subprocess.Popen(
                cmd,
                shell=True,
                cwd=str(frontend_path),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        else:
            process = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=str(frontend_path),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        
        processes.append(process)
        log_success("Frontend process started (PID: {})".format(process.pid))
        return process
    except Exception as e:
        log_error(f"Failed to start frontend: {e}")
        log_error("Make sure Node.js and npm are installed and in PATH")
        log_error("Install from: https://nodejs.org")
        return None

def http_get(url: str, timeout: int = 2) -> bool:
    """Make HTTP GET request using urllib"""
    try:
        response = urlopen(url, timeout=timeout)
        return response.status == 200
    except (URLError, Exception):
        return False

def http_post(url: str, data: dict, timeout: int = 5) -> bool:
    """Make HTTP POST request using urllib"""
    try:
        import json
        from urllib.request import Request
        
        json_data = json.dumps(data).encode('utf-8')
        req = Request(url, data=json_data, headers={'Content-Type': 'application/json'})
        response = urlopen(req, timeout=timeout)
        return response.status == 200 or response.status == 201
    except (URLError, Exception):
        return False

def wait_for_service(url: str, service_name: str, timeout: int = 60) -> bool:
    """Wait for a service to be ready"""
    log_info(f"Waiting for {service_name} to be ready...")
    
    start_time = time.time()
    counter = 0
    while time.time() - start_time < timeout:
        if http_get(f"{url}/api/health"):
            log_success(f"{service_name} is ready!")
            return True
        
        counter += 1
        elapsed = int(time.time() - start_time)
        
        # Show progress every 5 seconds
        if counter % 5 == 0:
            print(f"\r{Colors.OKCYAN}Waiting...{elapsed}s{Colors.ENDC}", end="", flush=True)
        
        time.sleep(1)
    
    print()
    log_error(f"{service_name} did not respond within {timeout}s")
    return False

def create_admin_user() -> bool:
    """Create admin user with improved error handling"""
    log_info("Creating admin user...")
    
    try:
        # Try to login first - if successful, user exists
        login_payload = {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        if http_post(f"{BACKEND_URL}/api/auth/login", login_payload):
            log_success("Admin user already exists!")
            log_info(f"  Email: {ADMIN_EMAIL}")
            return True
        
        # Create new admin user
        signup_payload = {
            "name": ADMIN_USERNAME,
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        }
        
        if http_post(f"{BACKEND_URL}/api/auth/signup", signup_payload):
            log_success(f"Admin user created successfully!")
            log_info(f"  Email: {ADMIN_EMAIL}")
            log_info(f"  Password: {ADMIN_PASSWORD}")
            log_info(f"  Name: {ADMIN_USERNAME}")
            return True
        else:
            log_warning("Admin user creation returned error")
            log_warning(f"  (Make sure backend is running at {BACKEND_URL}/api/health)")
            return False
            
    except Exception as e:
        log_error(f"Failed to create admin user: {e}")
        return False

def open_browser():
    """Open the application in default browser"""
    log_info("Opening browser...")
    
    try:
        # Try to open with default browser
        webbrowser.open(FRONTEND_URL)
        log_success(f"Browser opened to {FRONTEND_URL}")
        return True
    except Exception as e:
        log_warning(f"Could not open browser: {e}")
        log_info(f"You can manually access the application at: {Colors.BOLD}{FRONTEND_URL}{Colors.ENDC}")
        return False

def verify_services() -> bool:
    """Verify both services are running"""
    log_info("Verifying services...")
    
    backend_ok = http_get(f"{BACKEND_URL}/api/health")
    frontend_ok = http_get(FRONTEND_URL)
    
    if backend_ok:
        log_success("Backend is responding")
    else:
        log_warning("Backend not responding")
    
    if frontend_ok:
        log_success("Frontend is responding")
    else:
        log_warning("Frontend not responding")
    
    return backend_ok and frontend_ok

def main():
    """Main entry point"""
    
    # Register cleanup on exit
    atexit.register(cleanup)
    
    def signal_handler(sig, frame):
        log_info("Shutting down...")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    if hasattr(signal, 'SIGTERM'):
        signal.signal(signal.SIGTERM, signal_handler)
    
    log_header("🚀 STUDENT OS SYSTEM LAUNCHER")
    
    # Check if running from correct directory
    root_path = Path(__file__).parent
    backend_path = root_path / "backend"
    frontend_path = root_path / "frontend"
    
    if not backend_path.exists() or not frontend_path.exists():
        log_error("Backend or frontend directory not found!")
        log_error(f"Expected backend at: {backend_path}")
        log_error(f"Expected frontend at: {frontend_path}")
        sys.exit(1)
    
    log_success("Directory structure verified")
    
    # Verify npm is available
    log_header("Checking Prerequisites")
    
    if not verify_npm_available():
        log_error("Cannot proceed without npm")
        sys.exit(1)
    
    log_success("All prerequisites verified")
    
    # Start services
    log_header("Starting Services")
    
    backend = start_backend()
    if not backend:
        log_error("Failed to start backend")
        sys.exit(1)
    
    time.sleep(3)  # Give backend time to start
    
    frontend = start_frontend()
    if not frontend:
        log_error("Failed to start frontend")
        sys.exit(1)
    
    time.sleep(3)  # Give frontend time to start
    
    # Wait for services to be ready
    log_header("Waiting for Services to Start")
    
    backend_ready = wait_for_service(BACKEND_URL, "Backend", timeout=60)
    if not backend_ready:
        log_error("Backend failed to start")
        sys.exit(1)
    
    time.sleep(2)
    
    frontend_ready = wait_for_service(FRONTEND_URL, "Frontend", timeout=60)
    if not frontend_ready:
        log_error("Frontend failed to start")
        sys.exit(1)
    
    # Create admin user
    log_header("Setting Up Admin User")
    
    time.sleep(2)
    admin_created = create_admin_user()
    if not admin_created:
        log_warning("Could not create admin user (you can create it manually)")
    
    # Verify services
    log_header("Verifying System")
    
    time.sleep(1)
    verify_services()
    
    # Open browser
    log_header("Launching Browser")
    
    open_browser()
    
    # Final summary
    log_header("✨ System Ready!")
    
    print(f"\n{Colors.BOLD}System Status:{Colors.ENDC}")
    print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Backend: {Colors.BOLD}{BACKEND_URL}{Colors.ENDC}")
    print(f"  {Colors.OKGREEN}✓{Colors.ENDC} Frontend: {Colors.BOLD}{FRONTEND_URL}{Colors.ENDC}")
    print(f"\n{Colors.BOLD}Admin Credentials:{Colors.ENDC}")
    print(f"  Email: {Colors.BOLD}{ADMIN_EMAIL}{Colors.ENDC}")
    print(f"  Password: {Colors.BOLD}{ADMIN_PASSWORD}{Colors.ENDC}")
    print(f"  Username: {Colors.BOLD}{ADMIN_USERNAME}{Colors.ENDC}")
    print(f"\n{Colors.BOLD}Access the application:{Colors.ENDC}")
    print(f"  {Colors.OKCYAN}{FRONTEND_URL}{Colors.ENDC}")
    print(f"\n{Colors.BOLD}Press Ctrl+C to stop all services{Colors.ENDC}\n")
    
    # Keep services running
    try:
        while True:
            # Check if processes are still running
            if backend and backend.poll() is not None:
                log_error("Backend process crashed!")
                log_info("Attempting to restart backend...")
                backend = start_backend()
                time.sleep(3)
            
            if frontend and frontend.poll() is not None:
                log_error("Frontend process crashed!")
                log_info("Attempting to restart frontend...")
                frontend = start_frontend()
                time.sleep(3)
            
            time.sleep(5)
    except KeyboardInterrupt:
        log_info("Shutting down services (Ctrl+C pressed)...")

if __name__ == "__main__":
    main()
