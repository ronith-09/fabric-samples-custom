# 🚀 Complete Guide: Hosting FabCar Frontend + Backend

This guide covers all ways to run your FabCar application - from local development to production deployment.

---

## Table of Contents

1. [Quick Start - Local Development](#quick-start)
2. [Production Hosting](#production-hosting)
3. [Docker Deployment](#docker-deployment)
4. [Cloud Hosting Options](#cloud-hosting)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start - Local Development {#quick-start}

The easiest way to run everything locally with one command.

### Prerequisites

- Node.js v14+ (check: `node --version`)
- npm or yarn (check: `npm --version`)
- 2 open ports: 3000 (frontend) and 4000 (backend)

### Step 1: Navigate to Project

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar
```

### Step 2: Install Dependencies (First Time Only)

```bash
# Backend dependencies
cd javascript
npm install
cd ..

# Frontend dependencies
cd app/frontend
npm install  # or: yarn install
cd ../..
```

### Step 3: Start Everything with One Command

```bash
./start-fabcar.sh start
```

**Expected Output:**
```
================================================
🚀 FabCar Full Stack Startup
================================================
✓ Backend started (PID: 12345)
✓ Backend health check passed
✓ Frontend starting (PID: 12346)

================================================
✓ All services started!
================================================

🌐 Frontend:  http://localhost:3000
🔌 Backend:   http://localhost:4000/api

Press Ctrl+C to stop all services
```

### Step 4: Open in Browser

```
http://localhost:3000
```

You'll see:
- ✅ React login page
- ✅ Admin/Bank/Customer dashboards
- ✅ All UI forms connected to backend
- ✅ Real-time API communication

### Step 5: Test the Connection

1. Login with any credentials (backend doesn't validate initially)
2. Try filling a form and submitting
3. Check the response in the UI
4. Watch backend logs: `./start-fabcar.sh logs`

---

## Production Hosting {#production-hosting}

For real-world deployment with proper setup.

### Option A: Build Frontend + Run on Same Server

Best for: Small to medium deployments, all on one machine.

#### Step 1: Build the Frontend

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend

# Build production optimized bundle
npm run build
# or
yarn build
```

This creates an optimized `build/` folder (~3-5MB gzipped).

#### Step 2: Serve Frontend with Backend

Update your backend to serve the built frontend:

```bash
# In javascript/server.js, add at the top after imports:

const express = require('express');
const path = require('path');
const app = express();

// ... existing middleware ...

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../app/frontend/build')));

// Fallback to index.html for React Router
app.get('*', (req, res) => {
  // Only if not an API call
  if (!req.url.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../app/frontend/build/index.html'));
  }
});

// ... existing routes ...
```

#### Step 3: Start Single Server

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/javascript
PORT=3000 node server.js
```

Now everything runs on a single port: `http://localhost:3000`

**Architecture:**
```
http://localhost:3000/
  ├── Static files (React build)
  └── /api/* endpoints (Express)
```

---

### Option B: Separate Frontend and Backend Services

Best for: Scalability, microservices, cloud deployment.

#### Frontend: Deploy on Vercel/Netlify (Easiest)

##### Using Vercel (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy from project root:**
   ```bash
   cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend
   vercel
   ```

4. **Set Environment Variable in Vercel Dashboard:**
   - Go to Settings → Environment Variables
   - Add: `REACT_APP_BACKEND_URL` = `https://your-backend-url.com/api`
   - Redeploy

5. **Get your frontend URL:** (e.g., `https://fabcar-frontend.vercel.app`)

##### Using Netlify

1. **Build locally:**
   ```bash
   cd app/frontend
   npm run build
   ```

2. **Upload `build/` folder to Netlify** or use GitHub integration

3. **Set build command:** `npm run build`

4. **Set environment variable:**
   - `REACT_APP_BACKEND_URL=https://your-backend-url.com/api`

5. **Get your frontend URL**

#### Backend: Deploy on Your Server/Cloud

##### AWS EC2

1. **Launch instance:**
   - OS: Ubuntu 20.04 LTS
   - Ports: 4000 (backend)

2. **SSH into instance:**
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```

3. **Install Node.js:**
   ```bash
   curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Clone/upload your repository:**
   ```bash
   git clone https://github.com/your-repo/fabcar.git
   cd fabcar
   ```

5. **Install dependencies:**
   ```bash
   cd javascript
   npm install
   ```

6. **Set environment variables:**
   ```bash
   export FABRIC_NETWORK_RUNNING=false  # Set based on your setup
   export PORT=4000
   ```

7. **Start with PM2 (for persistence):**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "fabcar-backend" -- --port=4000
   pm2 save
   pm2 startup
   ```

8. **Enable CORS in backend** (`javascript/server.js`):
   ```javascript
   const cors = require('cors');
   app.use(cors({
     origin: 'https://your-frontend-url.vercel.app',
     credentials: true
   }));
   ```

9. **Get Backend URL:** `http://your-ec2-ip:4000/api`

10. **Update Frontend Environment Variable:**
    - Set `REACT_APP_BACKEND_URL=http://your-ec2-ip:4000/api`
    - Redeploy frontend

---

## Docker Deployment {#docker-deployment}

Containerize both frontend and backend for easy deployment.

### Step 1: Create Backend Dockerfile

Create `javascript/Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
```

### Step 2: Create Frontend Dockerfile

Create `app/frontend/Dockerfile`:

```dockerfile
FROM node:16-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Step 3: Create Frontend nginx.conf

Create `app/frontend/nginx.conf`:

```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
    location /api {
        proxy_pass http://backend:4000/api;
    }
}
```

### Step 4: Create docker-compose.yml

Create `/docker-compose.yml` in project root:

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./javascript
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
    restart: always
    networks:
      - fabcar-network

  frontend:
    build:
      context: ./app/frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    environment:
      - REACT_APP_BACKEND_URL=http://localhost:4000/api
    depends_on:
      - backend
    restart: always
    networks:
      - fabcar-network

networks:
  fabcar-network:
    driver: bridge
```

### Step 5: Build and Run with Docker

```bash
# Build images
docker-compose build

# Run services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Access at:** `http://localhost`

---

## Cloud Hosting Options {#cloud-hosting}

### Heroku (Easiest - Free tier ending soon)

#### Deploy Backend

1. **Install Heroku CLI:**
   ```bash
   npm install -g heroku
   ```

2. **Login:**
   ```bash
   heroku login
   ```

3. **Create app:**
   ```bash
   heroku create your-fabcar-backend
   ```

4. **Create `Procfile` in `javascript/` folder:**
   ```
   web: node server.js
   ```

5. **Deploy:**
   ```bash
   cd javascript
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

6. **Get URL:** `https://your-fabcar-backend.herokuapp.com/api`

#### Deploy Frontend to Vercel

1. Set `REACT_APP_BACKEND_URL=https://your-fabcar-backend.herokuapp.com/api`
2. Deploy to Vercel (see Vercel section above)

---

### Railway.app (Modern Alternative)

1. **Create account:** https://railway.app
2. **Connect GitHub repo**
3. **Add Environment Variables**
4. **Deploy** - automatic on push

---

### Google Cloud Platform (GCP)

1. **Create Cloud Run service for backend**
2. **Deploy frontend to Cloud Storage + Cloud CDN**
3. **Configure CORS in backend**

---

## Detailed Setup Examples {#setup-examples}

### Example 1: Local Development

```bash
# Terminal 1
cd /mnt/c/Users/HP/second/fabric-samples/fabcar
./start-fabcar.sh start

# Terminal 2 (optional - view logs)
./start-fabcar.sh logs

# Browser
http://localhost:3000
```

### Example 2: Production on Single Server

```bash
# Build frontend
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend
npm run build

# Update backend to serve frontend (as shown above)

# Start backend
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/javascript
PORT=3000 node server.js

# Browser
http://your-server:3000
```

### Example 3: Separate Services with Docker

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar
docker-compose up -d

# Frontend: http://localhost
# Backend: http://localhost:4000/api
```

---

## Environment Variables Checklist {#environment-variables}

### Frontend (.env)
```properties
✓ REACT_APP_BACKEND_URL=http://localhost:4000/api (or your backend URL)
✓ WDS_SOCKET_PORT=3000
✓ REACT_APP_ENABLE_VISUAL_EDITS=false
✓ ENABLE_HEALTH_CHECK=true
```

### Backend
```properties
✓ PORT=4000
✓ NODE_ENV=development (or production)
✓ Fabric network settings (if needed)
```

---

## Performance & Security {#performance-security}

### Frontend Optimization
```bash
# Build with optimizations
npm run build

# Check bundle size
npm install -g webpack-bundle-analyzer
npm run build -- --analyze
```

### Backend Security
1. **Enable CORS properly:**
   ```javascript
   const cors = require('cors');
   app.use(cors({
     origin: process.env.FRONTEND_URL || '*',
     credentials: true
   }));
   ```

2. **Use HTTPS in production:**
   ```javascript
   const https = require('https');
   const fs = require('fs');
   
   const options = {
     key: fs.readFileSync('path/to/key.pem'),
     cert: fs.readFileSync('path/to/cert.pem')
   };
   
   https.createServer(options, app).listen(443);
   ```

3. **Rate limiting:**
   ```bash
   npm install express-rate-limit
   ```

### Database & Persistence
- Backend currently uses in-memory (no persistence)
- For production, add PostgreSQL/MongoDB:
  ```bash
  npm install mongoose  # or pg
  ```

---

## Troubleshooting {#troubleshooting}

### Frontend won't connect to backend

**Problem:** "Failed to fetch" or CORS errors

**Solution:**
1. Check backend is running: `curl http://localhost:4000/api/health`
2. Check frontend `.env`: `REACT_APP_BACKEND_URL=http://localhost:4000/api`
3. Restart frontend: `npm start`
4. Check browser console (F12) for exact error
5. Verify CORS enabled in backend

### Port already in use

**Problem:** "Port 3000/4000 already in use"

**Solution:**
```bash
# Find process using port
lsof -i :3000  # or :4000

# Kill it
kill -9 <PID>

# Or use different port
PORT=5000 node server.js
```

### Frontend loads but shows blank page

**Problem:** "Blank white page"

**Solution:**
1. Open DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests
4. Verify `PUBLIC_URL` if using subdirectory

### Backend 500 error

**Problem:** "500 Internal Server Error"

**Solution:**
1. Check backend logs: `./start-fabcar.sh logs`
2. Verify `app.js` exists and is correct
3. Check Fabric network if using real blockchain
4. Verify wallet identities enrolled

---

## Recommended Production Stack

For best results, use this architecture:

```
┌─────────────────────────────────────────────┐
│         Vercel (Frontend)                   │
│  - React build served via CDN               │
│  - Automatic deployments from GitHub        │
│  - REACT_APP_BACKEND_URL set in env vars    │
└──────────────┬──────────────────────────────┘
               │ HTTP/HTTPS API calls
               ▼
┌─────────────────────────────────────────────┐
│   AWS/GCP/Azure (Backend)                   │
│  - Node.js Express server on port 4000      │
│  - PM2 for process management               │
│  - Nginx reverse proxy for HTTPS            │
│  - Connected to Fabric network              │
│  - Logs to CloudWatch/Stackdriver           │
└─────────────────────────────────────────────┘
```

---

## Summary - Quick Reference

| Scenario | Command | URL |
|----------|---------|-----|
| Local Dev | `./start-fabcar.sh start` | http://localhost:3000 |
| Single Server Prod | `PORT=3000 node server.js` | http://your-server:3000 |
| Docker | `docker-compose up -d` | http://localhost |
| Vercel + Backend | Deploy separately | https://your-frontend.vercel.app |
| Heroku | `git push heroku main` | https://your-app.herokuapp.com |

---

## Next Steps

1. **Decide hosting model:**
   - [ ] Local development (use `./start-fabcar.sh start`)
   - [ ] Single server production (build + serve)
   - [ ] Separate services (Vercel + AWS)
   - [ ] Docker/Kubernetes

2. **Prepare for production:**
   - [ ] Build frontend: `npm run build`
   - [ ] Test backend API
   - [ ] Set environment variables
   - [ ] Configure CORS

3. **Deploy:**
   - [ ] Choose hosting provider
   - [ ] Follow provider's setup guide
   - [ ] Verify frontend-backend connection
   - [ ] Monitor logs and performance

---

**Ready to deploy? Start with local development first, then move to production!**

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar
./start-fabcar.sh start
```

Then visit: **http://localhost:3000**

🎉 Happy coding!
