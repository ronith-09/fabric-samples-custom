# 🎯 Quick Implementation - Choose Your Path

Pick the scenario that matches your needs and follow the steps.

---

## Path 1: Local Development (Right Now)

**Best for:** Development, testing, learning

**Time:** 2 minutes

**Steps:**

```bash
# 1. Navigate to project
cd /mnt/c/Users/HP/second/fabric-samples/fabcar

# 2. Run one command
./start-fabcar.sh start

# 3. Open browser
http://localhost:3000
```

**Done!** ✅

Your frontend and backend are now running together locally.

---

## Path 2: Single Server Production

**Best for:** Deploy on your own server (AWS EC2, Digital Ocean, etc.)

**Time:** 15 minutes

**Steps:**

### Step 1: Build Frontend

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend
npm run build
```

Creates optimized `build/` folder (~3-5MB).

### Step 2: Update Backend to Serve Frontend

Edit `javascript/server.js` and add this **after the port definition, before routes**:

```javascript
const express = require('express');
const path = require('path');

const app = express();
// ... existing middleware ...

// Add this:
const frontendBuildPath = path.join(__dirname, '../app/frontend/build');
app.use(express.static(frontendBuildPath));

// Add this BEFORE your API routes:
app.get('/api/health', (req, res) => {
    // Keep this working
    res.json({ status: 'Backend server is running', timestamp: new Date() });
});

// Add after all your /api routes:
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
});
```

### Step 3: Start Single Server

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar/javascript
PORT=3000 node server.js
```

### Step 4: Access

```
http://your-server-ip:3000
```

**Done!** ✅

Everything runs on one port - frontend and backend together.

---

## Path 3: Separate Frontend & Backend (Recommended for Cloud)

**Best for:** Scalability, cloud deployment

**Time:** 30 minutes

### Part A: Deploy Backend

#### Option 1: On AWS EC2

1. **Launch Ubuntu instance and SSH in**

2. **Install Node.js:**
   ```bash
   curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone your repo:**
   ```bash
   git clone https://github.com/your-repo/fabcar.git
   cd fabcar/javascript
   npm install
   ```

4. **Start with PM2 (keeps running in background):**
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name "fabcar" -- --port 4000
   pm2 save
   pm2 startup
   ```

5. **Note your backend URL:**
   ```
   http://your-ec2-ip:4000/api
   ```

#### Option 2: On Railway.app (Easier)

1. Go to https://railway.app
2. Connect your GitHub repo
3. Deploy - gets automatic URL like `https://fabcar-backend-xyz.railway.app/api`

#### Option 3: On Heroku

```bash
cd javascript
heroku login
heroku create your-fabcar-backend
echo "web: node server.js" > Procfile
git init && git add . && git commit -m "deploy"
git push heroku main
# Gets URL: https://your-fabcar-backend.herokuapp.com/api
```

### Part B: Deploy Frontend

#### Option 1: On Vercel (Easiest)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd /mnt/c/Users/HP/second/fabric-samples/fabcar/app/frontend
   vercel
   ```

3. **In Vercel Dashboard:**
   - Go to Settings → Environment Variables
   - Add: `REACT_APP_BACKEND_URL` = `http://your-backend-url/api`
   - Redeploy

4. **Get URL:** (e.g., `https://fabcar.vercel.app`)

#### Option 2: On Netlify

1. **Build:**
   ```bash
   cd app/frontend
   npm run build
   ```

2. **Drag `build/` folder to Netlify** or connect GitHub

3. **Set environment variable:**
   - `REACT_APP_BACKEND_URL` = `http://your-backend-url/api`

#### Option 3: On Railway.app

Same as backend - just create separate service for frontend.

### Part C: Connect Them

1. Backend URL: `http://your-backend-url/api`
2. Frontend: Set `REACT_APP_BACKEND_URL` environment variable
3. Redeploy frontend
4. **Done!** ✅

---

## Path 4: Docker Deployment

**Best for:** Consistency across environments, Kubernetes

**Time:** 20 minutes

### Step 1: Create Dockerfiles

**`javascript/Dockerfile`:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 4000
CMD ["node", "server.js"]
```

**`app/frontend/Dockerfile`:**
```dockerfile
FROM node:18-alpine AS builder
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

**`app/frontend/nginx.conf`:**
```nginx
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
}
```

### Step 2: Create docker-compose.yml

In project root:

```yaml
version: '3.8'

services:
  backend:
    build: ./javascript
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
    restart: always

  frontend:
    build: ./app/frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: always
```

### Step 3: Run

```bash
cd /mnt/c/Users/HP/second/fabric-samples/fabcar
docker-compose up -d
```

### Step 4: Access

```
http://localhost
```

**Done!** ✅

---

## Path 5: Using Node.js Module Server (Alternative)

**Best for:** Existing Node.js infrastructure

If you want to use the Node.js client module directly:

```javascript
const FabCarClient = require('./client');

(async () => {
    const client = new FabCarClient('testUser');
    
    // Register
    const result = await client.register('Alice', 'pass123', 'USA');
    console.log(result);
    
    // Check wallet
    const wallet = await client.getWalletInfo('ADDR001', 'pass123');
    console.log(wallet);
})();
```

---

## Decision Tree - Which Path?

```
Are you developing locally?
├─ YES → Use Path 1 (Local Dev)
│        Command: ./start-fabcar.sh start
│
└─ NO
   Do you want everything on one server?
   ├─ YES → Use Path 2 (Single Server)
   │        Build + Serve frontend from backend
   │
   └─ NO
      Do you want to use Docker?
      ├─ YES → Use Path 4 (Docker)
      │        docker-compose up -d
      │
      └─ NO → Use Path 3 (Separate Services)
             Deploy frontend to Vercel
             Deploy backend to AWS/Railway/Heroku
```

---

## Common Issues & Fixes

### Issue: "CORS error" or "Failed to fetch"

**Fix:**
1. Verify backend running: `curl http://backend-url:4000/api/health`
2. Check frontend `.env`: `REACT_APP_BACKEND_URL=http://backend-url:4000/api`
3. Restart frontend after changing `.env`

### Issue: "Port 3000/4000 already in use"

**Fix:**
```bash
# Find what's using the port
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port
PORT=5000 node server.js
```

### Issue: "Cannot find module 'app.js'"

**Fix:**
```bash
# Make sure you're in javascript folder
cd javascript
ls app.js  # Should see it
npm install  # Install dependencies
```

### Issue: Blank white page in frontend

**Fix:**
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab - any failed requests?
4. Verify `REACT_APP_BACKEND_URL` is correct

---

## Production Checklist

Before deploying to production:

- [ ] Frontend built: `npm run build`
- [ ] Backend tested with curl
- [ ] Environment variables set correctly
- [ ] CORS enabled in backend
- [ ] SSL/HTTPS configured
- [ ] Logs setup (CloudWatch, etc.)
- [ ] Health checks working
- [ ] Database/persistence setup (if needed)
- [ ] Rate limiting enabled
- [ ] Monitoring/alerts configured

---

## Support

**See full guide:** `HOSTING_GUIDE.md`

**Configuration:** `CONNECTION_STATUS.md`

**Quick start:** `QUICKSTART.md`

---

## Choose Your Path Now

**Just getting started?**
```bash
./start-fabcar.sh start
# Then http://localhost:3000
```

**Ready for production?**
- Single server? → See Path 2
- Cloud? → See Path 3  
- Docker? → See Path 4

🚀 **Let's deploy!**
