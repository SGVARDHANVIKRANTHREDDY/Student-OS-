# 🚀 Student OS - Quick Start Guide

## One-Command Startup Options

Choose one of these options to start the entire Student OS system:

### Option 1: Double-Click (EASIEST - Windows)
Simply navigate to the project root folder and **double-click one of these files**:
- `RUNSTUDENTOS.bat` - Windows Batch file (no PowerShell required)
- `RUNSTUDENTOS.ps1` - PowerShell script (requires PowerShell)

### Option 2: Command Line (Any OS)
```bash
python RUNSTUDENTOS.py
```

### Option 3: PowerShell
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\RUNSTUDENTOS.ps1
```

---

## What Happens When You Run It? ✨

The startup script automatically:

1. **Starts Backend Server** (http://127.0.0.1:5000)
   - Node.js Express server
   - SQLite database
   - API endpoints ready

2. **Starts Frontend Server** (http://localhost:3000)
   - React development server
   - Vite bundler
   - Live reload enabled

3. **Creates Admin User**
   - Email: `admin@123`
   - Password: `Admin123@45`
   - Username: `Admin`

4. **Opens Browser**
   - Automatically launches your default browser
   - Navigates to http://localhost:3000

5. **Verifies Everything**
   - Checks both services are responding
   - Confirms database connectivity
   - Shows status in terminal

6. **Keeps Services Running**
   - Monitors for crashes
   - Auto-restarts if needed
   - Press `Ctrl+C` to stop all services

---

## First Time Setup

### Prerequisites
- Python 3.8+ installed
- Node.js 18+ installed
- npm installed

### One-Time Setup
Before running for the first time, install dependencies:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

Then run the startup script. It will handle everything else!

---

## Login Credentials

After startup, you can login with:

**Admin Account:**
- Email: `admin@123`
- Password: `Admin123@45`

Or create a new account by signing up.

---

## Troubleshooting

### "Python not found"
- Install Python from https://www.python.org
- Make sure to check "Add Python to PATH" during installation
- Restart your terminal/command prompt

### "Permission denied" on macOS/Linux
```bash
chmod +x RUNSTUDENTOS.py
python3 RUNSTUDENTOS.py
```

### "requests module not found"
The scripts will attempt to install it automatically. If not:
```bash
pip install requests
```

### Browser doesn't open
- The server is still running
- Manually open http://localhost:3000 in your browser

### Port already in use
- Stop any other Node.js processes
- Or edit the port numbers in the Python script

---

## File Descriptions

- **RUNSTUDENTOS.py** - Main Python launcher (cross-platform)
- **RUNSTUDENTOS.bat** - Windows batch wrapper (easiest for Windows)
- **RUNSTUDENTOS.ps1** - PowerShell launch script
- **QUICKSTART.md** - This file

---

## Next Steps

1. Run the startup script
2. Login with admin@123 / Admin123@45
3. Explore the application
4. Create additional user accounts
5. Check logs in the terminal for debugging

---

## System Architecture

```
┌─────────────────────────────────────────┐
│         RUNSTUDENTOS.py                 │
│    (Python Launcher Script)             │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
    ┌─────────────┐    ┌─────────────┐
    │  Backend    │    │  Frontend   │
    │  Port 5000  │    │  Port 3000  │
    └─────────────┘    └─────────────┘
    - Express.js       - React 18
    - Node.js          - Vite
    - SQLite           - React Router
```

---

## Performance

- Backend startup: ~3 seconds
- Frontend startup: ~3 seconds
- Total startup time: ~10 seconds
- First page load: ~2 seconds

---

## Security

- Admin account created on first run
- Default credentials provided
- Recommended: Change password after first login
- Database: SQLite (local development only)

---

## Support

See README.md for full documentation and architecture details.

---

**Happy coding! 🎉**
