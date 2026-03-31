# STUDENT OS - COMPLETE LAUNCHER SYSTEM GUIDE

## Overview

Three powerful launcher methods have been created to start your entire Student OS system with just ONE command. Pick your favorite!

---

## 🎯 THREE WAYS TO START

### 1️⃣ **EASIEST - Windows (Double-click)**
**File:** `RUNSTUDENTOS.bat`

Simply navigate to your project folder and **double-click** this file. Everything happens automatically.

✅ Best for: Windows users who want simplicity

---

### 2️⃣ **PowerShell (One-liner)**
**File:** `RUNSTUDENTOS.ps1`

```powershell
.\RUNSTUDENTOS.ps1
```

✅ Best for: PowerShell users on Windows/macOS/Linux

---

### 3️⃣ **Universal Python (All OS)**
**File:** `RUNSTUDENTOS.py`

```bash
python RUNSTUDENTOS.py
```

✅ Best for: Maximum portability (Windows/Mac/Linux)

---

## 🚀 WHAT HAPPENS AUTOMATICALLY

When you run any launcher, it automatically:

1. **Starts Backend Server** 
   - Express.js on http://127.0.0.1:5000
   - SQLite database ready
   - API endpoints responding

2. **Starts Frontend Server**
   - React/Vite on http://localhost:3000
   - Development build with hot-reload
   - Connected to backend

3. **Creates Admin User**
   - Email: `admin@123`
   - Password: `Admin123@45`
   - Username: `Admin`
   - (Or skipped if account already exists)

4. **Verifies Everything**
   - Pings health endpoints
   - Confirms services are responding
   - Shows status in terminal

5. **Opens Browser**
   - Automatically launches your default browser
   - Goes directly to http://localhost:3000
   - Ready to use immediately

6. **Keeps Services Running**
   - Monitors both servers
   - Auto-restarts if they crash
   - Shows color-coded status updates

---

## 🎮 USAGE EXAMPLES

### Start Everything (Windows)
```bash
# Just double-click RUNSTUDENTOS.bat in File Explorer
# Or in command prompt:
RUNSTUDENTOS.bat
```

### Start Everything (PowerShell)
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\RUNSTUDENTOS.ps1
```

### Start Everything (Any OS with Python)
```bash
python RUNSTUDENTOS.py
```

### Stop Everything
```
Press Ctrl+C in the terminal
```

The script will:
- Gracefully shutdown both servers
- Kill all node processes
- Clean up resources
- Show completion message

---

## 📊 STARTUP TIMELINE

```
┌─────────────────────────────────────────────────────┐
│ When you run RUNSTUDENTOS.* it does:                │
├─────────────────────────────────────────────────────┤
│ 0s   │ Display launcher header                       │
│ 1s   │ Verify directory structure                    │
│ 2s   │ Start backend server (npm run dev)            │
│ 5s   │ Start frontend server (npm run dev)           │
│ 7s   │ Wait for backend to respond...                │
│ 11s  │ Backend ready! ✅                             │
│ 13s  │ Wait for frontend to respond...               │
│ 16s  │ Frontend ready! ✅                            │
│ 18s  │ Create admin user...                          │
│ 20s  │ Verify both services...                       │
│ 21s  │ Open browser to localhost:3000                │
│ 22s  │ Display credentials & ready message           │
│      │ Systems online and waiting for input          │
└─────────────────────────────────────────────────────┘

Total Time: ~22 seconds from click to browser open
```

---

## 🔐 LOGIN AFTER STARTUP

### Admin Account
- **Email:** `admin@123`
- **Password:** `Admin123@45`
- **Username:** `Admin`

### Or Create New Account
Click "Sign up" on the login page and create your own account.

---

## 🛠️ TECHNICAL DETAILS

### What Each Launcher Does

#### `RUNSTUDENTOS.bat` (Windows)
- Batch script wrapper
- Checks for Python installation
- Installs `requests` package if needed (optional)
- Calls `RUNSTUDENTOS.py`
- Graceful error handling
- Keep window open on error

#### `RUNSTUDENTOS.ps1` (PowerShell)
- PowerShell script wrapper
- Checks Python version
- Installs dependencies
- Calls `RUNSTUDENTOS.py`
- Color-coded output
- Exit code handling

#### `RUNSTUDENTOS.py` (Core)
- Pure Python implementation
- **NO external dependencies required** (uses built-in urllib)
- Cross-platform compatible
- Colored terminal output
- Process monitoring
- Auto-restart on crash
- Graceful shutdown on Ctrl+C

---

## ⚙️ CONFIGURATION

### Change Admin Credentials
Edit `RUNSTUDENTOS.py` and modify these lines:

```python
ADMIN_EMAIL = "admin@123"           # Change email
ADMIN_PASSWORD = "Admin123@45"      # Change password
ADMIN_USERNAME = "Admin"            # Change username
```

### Change Port Numbers
Edit `RUNSTUDENTOS.py`:

```python
BACKEND_URL = "http://127.0.0.1:5000"    # Backend port
FRONTEND_URL = "http://localhost:3000"   # Frontend port
```

---

## 🐛 TROUBLESHOOTING

### "Python not found"
**Solution:** Install Python 3.8+ from https://www.python.org
- Make sure to check "Add Python to PATH" during installation

### "Port already in use"
**Solution:** Kill existing processes or change ports
```bash
# Windows
taskkill /F /IM node.exe

# Mac/Linux
pkill node
```

### "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org
- npm comes bundled with Node.js

### "Permission denied" (Mac/Linux)
**Solution:** Make files executable
```bash
chmod +x RUNSTUDENTOS.py
chmod +x RUNSTUDENTOS.ps1
```

### Backend won't start
**Check:** 
- Is npm installed? (`npm --version`)
- Are dependencies installed? (`cd backend && npm install`)
- Is PG_DISABLED=1 set?

### Frontend won't start
**Check:**
- Are dependencies installed? (`cd frontend && npm install`)
- Is port 3000 available?
- Try: `npm run dev` from the frontend folder manually

### Can't login
**Check:**
- Is backend responding? Go to http://127.0.0.1:5000/api/health
- Is frontend responding? Go to http://localhost:3000
- Try admin email: `admin@123` / password: `Admin123@45`

---

## 📋 PREREQUISITES

### Required
- Python 3.8+ (for launching)
- Node.js 18+ (for services)
- npm (comes with Node.js)

### Optional
- Git (for version control)
- Discord/Slack (for notifications)

---

## 🎓 DEVELOPER MODES

### Run Backend Only
```bash
cd backend
npm install
PG_DISABLED=1 npm run dev
```

### Run Frontend Only
```bash
cd frontend
npm install
npm run dev
```

### Run Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests  
cd frontend && npm test
```

### Production Build
```bash
# Backend (already running in dev mode)
# Frontend
cd frontend && npm run build
```

---

## 📊 MONITORING

### Check Services Running
```bash
# Windows
tasklist /FI "IMAGENAME eq node.exe"

# Mac/Linux
ps aux | grep node
```

### Check Ports
```bash
# Windows
netstat -ano | findstr ":5000"
netstat -ano | findstr ":3000"

# Mac/Linux
lsof -i :5000
lsof -i :3000
```

### View Logs
Look at the terminal output from the launcher - it shows:
- Startup progress
- Health check results
- Admin user creation status
- Service verification
- Auto-restart notifications

---

## 🚨 WHAT IF SOMETHING GOES WRONG?

### Launcher crashes
1. Check if Node.js is installed (`node --version`)
2. Try starting services manually first
3. Look for error messages in terminal
4. Check Internet connection (for any remote resources)

### Services crash during operation
1. The launcher auto-restarts them
2. Check logs for errors
3. Restart the launcher

### Can't access after startup
1. Verify browser opened to correct URL
2. Check http://localhost:3000 manually
3. Verify port numbers in configuration

### Admin account not created
1. Check backend is running (`http://127.0.0.1:5000/api/health`)
2. Create manually by signing up
3. Check email format: `admin@123` (contains @)

---

## ✨ PRO TIPS

1. **Keep launcher running during development**
   - It monitors and auto-restarts services
   - Shows real-time activity

2. **Create backup before change**
   - `.bat` and `.ps1` files are safe to modify
   - Backup `RUNSTUDENTOS.py` before editing config

3. **Use for CI/CD**
   - Single command to test entire system
   - Great for automation scripts

4. **Customize browser opening**
   - Script launches default browser
   - Manually open different browser if needed

5. **Environment variables**
   - Add to launcher if you need specific config
   - E.g., API keys, database URLs, etc.

---

## 🎯 QUICK REFERENCE

| Task | Command |
|------|---------|
| Start System | `RUNSTUDENTOS.bat` or `python RUNSTUDENTOS.py` |
| Stop System | `Ctrl+C` in launcher terminal |
| Test Backend | Visit http://127.0.0.1:5000/api/health |
| Test Frontend | Visit http://localhost:3000 |
| Login | admin@123 / Admin123@45 |
| Sign up | Click "Sign up" on login page |
| Reset Admin | Delete `student-os.sqlite` and restart |

---

## 📞 SUPPORT

- See [README.md](README.md) for full documentation
- Check [QUICKSTART.md](QUICKSTART.md) for quick setup
- Review [ARCHITECTURE_AND_PRODUCT.md](ARCHITECTURE_AND_PRODUCT.md) for system design
- Check terminal output for detailed error messages

---

## 🎉 YOU'RE ALL SET!

Your Student OS system is ready to:
- ✅ Start with a single command
- ✅ Automatically create admin user
- ✅ Verify everything is working
- ✅ Open in browser immediately
- ✅ Stay running for development
- ✅ Auto-restart if needed

**Choose your launcher and enjoy!**

```bash
# Windows: Double-click RUNSTUDENTOS.bat
# PowerShell: .\RUNSTUDENTOS.ps1
# Any OS: python RUNSTUDENTOS.py
```

---

**Happy coding! 🚀**
