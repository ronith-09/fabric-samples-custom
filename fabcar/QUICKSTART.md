# FabCar Full Stack Setup - Backend + Frontend

This guide shows how to run both the backend (Node.js/Express) and frontend (React) together locally on your machine.

## Current Setup

- **Backend**: Express.js server on **http://localhost:4000/api**
  - Location: `javascript/server.js`
  - Uses `app.js` (real Fabric chaincode integration)
  - Provides 28 REST endpoints for token management

- **Frontend**: React app on **http://localhost:3000**
  - Location: `app/frontend/`
  - Uses Tailwind CSS and Radix UI
  - Communicates with backend via REACT_APP_BACKEND_URL env var

---

## Quick Start - Run Both Together

### Option 1: Using the Unified Startup Script (Easiest)

From the project root (`/mnt/c/Users/HP/second/fabric-samples/fabcar`):

```bash
./start-fabcar.sh start
```

This will:
1. Start the backend on port 4000
2. Start the frontend on port 3000
3. Show both URLs and service status

Then open your browser to: **http://localhost:3000**

**To stop all services:**
```bash
./start-fabcar.sh stop
```

**To check status:**
```bash
./start-fabcar.sh status
```

**To view logs:**
```bash
./start-fabcar.sh logs
```

---

## Manual Setup - Run Services Separately

### Start Backend Only

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/javascript
PORT=4000 node server.js
```

Expected output:
```
FabCar Backend Server running on http://localhost:4000
API Documentation available at http://localhost:4000/api/health
```

### Start Frontend Only (in another terminal)

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend
npm start
```
or with yarn:
```bash
yarn start
```

The frontend will open automatically at **http://localhost:3000**

---

## Backend API Endpoints

All endpoints are prefixed with `http://localhost:4000/api`

### Core Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Check server health |
| POST | `/register` | Register new participant |
| POST | `/token-request` | Request new token |
| POST | `/mint-request` | Request to mint coins |
| GET | `/wallet/:address` | Get wallet information |
| GET | `/tokens` | View all tokens |

### Full List

See `javascript/server.js` for all 28 endpoints including:
- Customer registration & management
- Token approvals
- Mint approvals
- Transfer requests
- Transaction history

---

## Frontend Configuration

The frontend connects to the backend via `.env` file:

**File**: `app/frontend/.env`

```properties
REACT_APP_BACKEND_URL=http://localhost:4000/api
WDS_SOCKET_PORT=3000
REACT_APP_ENABLE_VISUAL_EDITS=false
ENABLE_HEALTH_CHECK=true
```

**Key Variables**:
- `REACT_APP_BACKEND_URL` - Backend API base URL
- `ENABLE_HEALTH_CHECK` - Auto-check backend health on load

---

## Testing the Full Stack

### 1. Verify Backend is Running

```bash
curl http://localhost:4000/api/health
```

Expected response:
```json
{
  "status": "Backend server is running",
  "timestamp": "2025-11-12T10:29:13.243Z"
}
```

### 2. Open Frontend in Browser

Navigate to: **http://localhost:3000**

You should see:
- Green status indicator (✓ Connected)
- Registration form
- Token request form
- Mint request form
- Query panels

### 3. Test an Endpoint

Fill the Registration form and click "Register Participant":
- **User ID**: testUser
- **Name**: Alice
- **Password**: pass123
- **Country**: USA

Click the button and check the response panel below.

---

## Troubleshooting

### Backend won't start (Port 4000 in use)

Find and kill the process:
```bash
lsof -i :4000
kill -9 <PID>
```

Then restart.

### Frontend won't start (Port 3000 in use)

```bash
lsof -i :3000
kill -9 <PID>
```

### Backend connection errors in frontend

1. Verify backend is running: `curl http://localhost:4000/api/health`
2. Check frontend `.env` has correct `REACT_APP_BACKEND_URL`
3. Reload the frontend page (F5)

### "Identity not found in wallet"

This means the Fabric network isn't set up. To use real blockchain:

1. Start Fabric network:
   ```bash
   cd /mnt/c/Users/HP/second/fabric-samples/fabcar
   ./startFabric.sh
   ```

2. Enroll admin:
   ```bash
   cd javascript
   node enrollAdmin.js
   ```

3. Register test user:
   ```bash
   node registerUser.js testUser
   ```

4. Try frontend calls again

---

## File Structure

```
fabcar/
├── start-fabcar.sh          ← Run this to start everything
├── startFabric.sh           ← Start Fabric network
├── networkDown.sh           ← Stop Fabric network
├── javascript/
│   ├── server.js            ← Express backend (28 endpoints)
│   ├── app.js               ← Real Fabric chaincode integration
│   ├── client.js            ← Frontend wrapper (Node.js)
│   ├── wallet/              ← User identities
│   ├── enrollAdmin.js       ← Enroll admin identity
│   ├── registerUser.js      ← Register application users
│   └── package.json
└── app/
    └── frontend/            ← React frontend
        ├── .env             ← Configuration (REACT_APP_BACKEND_URL)
        ├── src/
        ├── public/
        ├── package.json
        └── start            ← Frontend dev server
```

---

## Environment Setup

### Prerequisites
- Node.js v14+ and npm/yarn
- Fabric network (optional, for real blockchain calls)

### Install Dependencies

Backend:
```bash
cd javascript
npm install
```

Frontend:
```bash
cd app/frontend
yarn install    # or npm install
```

---

## Development Workflow

1. **Make backend changes**: Edit `javascript/server.js` or `app.js`
   - Restart backend: `PORT=4000 node server.js`

2. **Make frontend changes**: Edit files in `app/frontend/src/`
   - Frontend auto-reloads on save

3. **Test end-to-end**:
   - Open http://localhost:3000
   - Use forms to call backend endpoints
   - Check responses in the UI

---

## Next Steps

- [ ] Start Fabric network (./startFabric.sh)
- [ ] Enroll identities (javascript/enrollAdmin.js, registerUser.js)
- [ ] Test endpoints via frontend
- [ ] Review transaction history in UI
- [ ] Deploy to production

---

## Support

For issues or questions:
1. Check backend logs: `./start-fabcar.sh logs`
2. Check frontend console: Browser DevTools (F12)
3. Verify port availability: `ss -ltn | grep -E ':(3000|4000)'`
4. Restart services: `./start-fabcar.sh restart`

---

**Happy coding! 🚀**
