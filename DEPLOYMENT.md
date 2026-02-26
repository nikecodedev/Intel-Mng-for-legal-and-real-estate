# Deploy GEMS to your VPS

This guide assumes a **fresh Linux VPS** (Ubuntu 22.04 recommended). Use your own IP and credentials; never commit passwords to the repo.

---

## 1. Connect to the VPS

From your local machine:

```bash
ssh root@164.92.71.218
```

Enter your password when prompted. **Security tip:** Set up SSH keys and disable password login after deployment:

```bash
# On your local machine (Windows: use Git Bash or WSL)
ssh-copy-id root@164.92.71.218
```

---

## 2. Install dependencies on the VPS

```bash
# Update system
apt update && apt upgrade -y

# Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node -v   # v20.x
npm -v    # 10+

# Optional: PM2 to run apps in background and restart on reboot
npm install -g pm2

# Optional: Nginx as reverse proxy (recommended for production)
apt install -y nginx certbot python3-certbot-nginx
```

---

## 3. Install and run PostgreSQL (and optionally Redis)

The API needs PostgreSQL. Redis is optional but used for queues/cache.

```bash
# PostgreSQL
apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive   # create user, e.g. platform_user
sudo -u postgres createdb platform_db       # create database
sudo -u postgres psql -c "ALTER USER platform_user WITH PASSWORD 'YOUR_DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE platform_db TO platform_user;"

# Optional: Redis
apt install -y redis-server
# If you want Redis protected: edit /etc/redis/redis.conf, set requirepass YOUR_REDIS_PASSWORD
systemctl enable redis-server && systemctl start redis-server
```

Replace `YOUR_DB_PASSWORD` and `YOUR_REDIS_PASSWORD` with strong passwords; keep them for the API `.env` in the next step.

---

## 4. Clone the project on the VPS

```bash
cd /var
git clone https://github.com/YOUR_ORG/Intel-Mng-for-legal-and-real-estate.git gems
cd gems
```

If the repo is private, use a deploy key or personal access token:

```bash
git clone https://YOUR_TOKEN@github.com/YOUR_ORG/Intel-Mng-for-legal-and-real-estate.git gems
```

---

## 5. Environment variables

### Backend API (`apps/api/.env`)

Create the file and set **production** values (never use dev defaults on the server):

```bash
cd /var/gems/apps/api
cp .env.example .env
nano .env
```

Example production `.env`:

```env
NODE_ENV=production
PORT=3000
API_VERSION=v1
LOG_LEVEL=info

# Required in production
DATABASE_URL=postgresql://platform_user:YOUR_DB_PASSWORD@localhost:5432/platform_db
JWT_SECRET=your-64-character-or-longer-secret-key-for-signing-tokens-change-this

# Must be your frontend URL(s), not *
CORS_ORIGIN=https://yourdomain.com

# Optional: if Redis has a password
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# Optional: tenant and Gemini
# DEFAULT_TENANT_ID=uuid-if-needed
# GEMINI_API_KEY=your-key-if-using-doc-processing
```

Replace `YOUR_DB_PASSWORD`, `YOUR_REDIS_PASSWORD`, `your-64-character...`, and `https://yourdomain.com` with real values.

### Frontend GEMS (`apps/gems/.env.production` or `.env.local`)

```bash
cd /var/gems/apps/gems
cp .env.example .env.local
nano .env.local
```

Set the API URL that the **browser** will call (your domain or VPS IP):

```env
# Use your domain or http://164.92.71.218 if no domain yet
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
# Or for testing by IP:
# NEXT_PUBLIC_API_URL=http://164.92.71.218:3000/api/v1
```

If the API is on the same server behind Nginx, use the same host as the frontend (e.g. `https://yourdomain.com/api/v1`).

---

## 6. Build and run

From the **repo root** (`/var/gems`):

```bash
# Install all dependencies (monorepo)
npm install

# Build API
cd apps/api && npm run build && cd ../..

# Build GEMS frontend
cd apps/gems && npm run build && cd ../..
```

### Option A: Run with PM2 (recommended)

```bash
cd /var/gems

# Start API (port 3000)
pm2 start apps/api/dist/index.js --name api -i 1

# Start GEMS (port 3001)
pm2 start npm --name gems -- start --prefix apps/gems

# Save process list so it restarts on reboot
pm2 save
pm2 startup
```

### Option B: Run without PM2 (foreground, for testing)

```bash
# Terminal 1 – API
cd /var/gems/apps/api && node dist/index.js

# Terminal 2 – GEMS (after API is up)
cd /var/gems/apps/gems && npm run start
```

Check:

- API: `curl http://localhost:3000/api/v1/health` (or the path your API uses)
- GEMS: open `http://164.92.71.218:3001` in a browser

---

## 7. Nginx reverse proxy (recommended)

So the app is served on port 80/443 and you can add SSL.

Create a site config:

```bash
nano /etc/nginx/sites-available/gems
```

Paste (replace `yourdomain.com` with your domain or use the VPS IP and adjust `server_name`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;   # or 164.92.71.218 if no domain

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

If using a **domain**, point its DNS A record to `164.92.71.218`, then get SSL:

```bash
certbot --nginx -d yourdomain.com
```

After SSL, set in GEMS `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
```

---

## 8. Firewall

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

If you use Nginx and no longer need direct access to 3000/3001 from the internet, do **not** open 3000/3001 in UFW.

---

## 9. Quick checklist

| Step | What to do |
|------|------------|
| 1 | SSH as root (later: use SSH keys, disable password) |
| 2 | Install Node 20, PM2, Nginx, Certbot |
| 3 | Install PostgreSQL (and optionally Redis), create DB and user |
| 4 | Clone repo into `/var/gems` |
| 5 | Set `apps/api/.env` (DATABASE_URL, JWT_SECRET, CORS_ORIGIN) |
| 6 | Set `apps/gems/.env.local` (NEXT_PUBLIC_API_URL) |
| 7 | `npm install` at root, build API and GEMS |
| 8 | Run with PM2 (api + gems) |
| 9 | Configure Nginx, reload, then Certbot if you have a domain |

---

## 10. Troubleshooting

- **API won’t start:** Check `apps/api/.env`, DATABASE_URL and JWT_SECRET. In production, JWT_SECRET must be at least 64 characters and CORS_ORIGIN must not be `*`.
- **Frontend can’t reach API:** Ensure NEXT_PUBLIC_API_URL matches the URL the browser uses (domain or IP + port). If using Nginx, use the same host and path (e.g. `/api/v1`).
- **502 Bad Gateway:** Backend not running or wrong port. Check `pm2 status` and that API listens on 3000 and GEMS on 3001.
- **Logs:** `pm2 logs api` and `pm2 logs gems`.

Never commit `.env` or `.env.local`; they contain secrets. Use a secrets manager or set env vars in PM2/Systemd if you prefer not to keep `.env` files on disk.
