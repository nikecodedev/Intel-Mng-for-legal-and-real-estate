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
git clone https://github.com/nikecodedev/Intel-Mng-for-legal-and-real-estate.git gems
cd gems
```

If the repo is private, use a deploy key or personal access token:

```bash
git clone https://YOUR_TOKEN@github.com/YOUR_ORG/Intel-Mng-for-legal-and-real-estate.git gems
```

---

## 4b. Clone / pull and deploy (steps 5–9 in order)

If you already have the VPS ready (Node, PM2, Nginx, Postgres, Redis) and only need to **clone or pull and go live**, run these in order on the server.

**A. Clone or pull**

```bash
cd /var
# First time: clone
git clone https://github.com/nikecodedev/Intel-Mng-for-legal-and-real-estate.git gems
# Already cloned: pull latest
# cd /var/gems && git pull origin main
cd gems
```

**B. API env**

```bash
cd /var/gems/apps/api
cp .env.example .env
nano .env
```

Set at least (use your real DB/Redis passwords and a 64+ char JWT secret):

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://platform_user:YOUR_DB_PASSWORD@localhost:5432/platform_db
JWT_SECRET=your-64-character-or-longer-secret-key-change-this
CORS_ORIGIN=http://164.92.71.218
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
```

Save (Ctrl+O, Enter, Ctrl+X in nano).

**C. GEMS env**

```bash
cd /var/gems/apps/gems
cp .env.example .env.local
echo 'NEXT_PUBLIC_API_URL=http://164.92.71.218/api/v1' > .env.local
# Or: nano .env.local  and paste that line
```

**D. Database migrations (required for login/register)**

Run migrations so the DB has the correct schema (tenants, users with tenant_id, refresh_tokens, audit_logs with API columns). From repo root:

```bash
cd /var/gems
bash scripts/run-migrations.sh
```

If you use **local PostgreSQL** (not Docker), set `POSTGRES_PASSWORD` and ensure `DATABASE_URL` in `apps/api/.env` is correct; the script uses `psql` with credentials from the environment. For Docker: `cd infrastructure/docker && docker compose exec -T postgres psql -U platform_user -d platform_db -f - < ../../apps/api/database/migrations/001_initial_schema.sql` (or use `run-migrations.sh` from the host with Docker Compose).

**E. Install, build, and run with PM2**

```bash
cd /var/gems
npm install
cd apps/api && (npm run build || npm run build:transpile) && cd ../..
cd apps/gems && npm run build && cd ../..
cd /var/gems
pm2 delete api gems 2>/dev/null || true
pm2 start apps/api/dist/index.js --name api -i 1
pm2 start npm --name gems -- start --prefix apps/gems
pm2 save
pm2 startup
```

**F. Nginx**

```bash
sudo cp /var/gems/infrastructure/nginx/gems.conf /etc/nginx/sites-available/gems
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**G. Firewall (if not done)**

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```

**H. Verify**

```bash
pm2 status
curl -s http://localhost:3000/health
curl -s http://164.92.71.218/api/v1/health
```

**Verify database (login/register schema)** — from repo root:

```bash
cd /var/gems
bash scripts/verify-database.sh
```

> If `scripts/verify-database.sh: No such file or directory`: run `git pull origin main` to fetch the latest code, then retry. Or use the manual DB check commands below.

This checks: system tenant exists, `users.tenant_id`, `refresh_tokens.tenant_id`, `audit_logs.event_type`. If any check fails, run `bash scripts/run-migrations.sh` again.

**Manual DB check (Docker Compose):**

```bash
cd /var/gems/infrastructure/docker
docker compose exec postgres psql -U platform_user -d platform_db -c "SELECT id, name FROM tenants;"
docker compose exec postgres psql -U platform_user -d platform_db -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tenant_id';"
```

**Manual DB check (local PostgreSQL):** use `psql` with the same user/db from `apps/api/.env` (e.g. `PGPASSWORD=yourpass psql -h localhost -U platform_user -d platform_db -c "SELECT 1 FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001';"`).

Then open **http://164.92.71.218** in a browser. You should see the GEMS app (not the Nginx default page); login will call the API at `http://164.92.71.218/api/v1`.

**Later: update after a git pull**

After building, **restart both** API and GEMS so the new builds are served (if you only restart `api`, the frontend can show chunk 404s):

```bash
cd /var/gems
git pull origin main
npm install
cd apps/api && npm run build && cd ../..
cd apps/gems && npm run build && cd ../..
pm2 restart api gems
```

**If you see the Nginx default page at http://164.92.71.218:** disable the default site and reload Nginx: `sudo rm -f /etc/nginx/sites-enabled/default && sudo systemctl reload nginx`

---

## 5. Environment variables (reference)

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
CORS_ORIGIN=http://164.92.71.218

# Optional: if Redis has a password
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# Optional: tenant and Gemini
# DEFAULT_TENANT_ID=uuid-if-needed
# GEMINI_API_KEY=your-key-if-using-doc-processing
```

Replace `YOUR_DB_PASSWORD`, `YOUR_REDIS_PASSWORD`, and `your-64-character...` with real values. Domain is set to http://164.92.71.218.

### Frontend GEMS (`apps/gems/.env.production` or `.env.local`)

```bash
cd /var/gems/apps/gems
cp .env.example .env.local
nano .env.local
```

Set the API URL that the **browser** will call (domain for this project: http://164.92.71.218):

```env
# With Nginx reverse proxy (recommended): same host, /api proxied to backend
NEXT_PUBLIC_API_URL=http://164.92.71.218/api/v1
# Without Nginx (direct ports):
# NEXT_PUBLIC_API_URL=http://164.92.71.218:3000/api/v1
```

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

- API: `curl http://localhost:3000/api/v1/health` (or `curl http://164.92.71.218/api/v1/health` if Nginx is up)
- GEMS: open `http://164.92.71.218` in a browser (with Nginx) or `http://164.92.71.218:3001` (direct)

---

## 7. Nginx reverse proxy (recommended)

So the app is served on port 80/443 and you can add SSL.

Copy the project's config and enable it (disabling the default site so GEMS is served on port 80):

```bash
sudo cp /var/gems/infrastructure/nginx/gems.conf /etc/nginx/sites-available/gems
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
```

Or create manually: `nano /etc/nginx/sites-available/gems` and paste (domain for this project: **164.92.71.218**):

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 164.92.71.218;

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

    # Backend API (no trailing slash so full URI /api/v1/... is passed)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Disable default site, enable GEMS, and reload:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

For SSL with a **domain name**, point its DNS A record to `164.92.71.218`, then run:

```bash
certbot --nginx -d yourdomain.com
```

Then set in GEMS `.env.local`: `NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1`.  
For **IP-only** (164.92.71.218), use HTTP only; no Certbot.

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

- **Redis NOAUTH / "NOAUTH Authentication required":** Redis is password-protected (`requirepass` in `/etc/redis/redis.conf`) but the API connects without a password. **Fix:** Add `REDIS_PASSWORD=your_redis_password` to `apps/api/.env` (same password as in redis.conf). If you don't need Redis (queues/cache), set `REDIS_ENABLED=false` in `.env` and restart the API.

- **Port 3000 in use / "EADDRINUSE null:3000":** Another process is already bound to port 3000. **Fix:** (1) Find what's using it: `sudo lsof -i :3000` or `sudo ss -tlnp | grep 3000`. (2) Stop duplicates: `pm2 delete api` then `pm2 start apps/api/dist/index.js --name api -i 1` (only one instance). (3) Kill stray processes: `kill -9 <PID>` for any old Node process holding the port. (4) Ensure only the API uses 3000; GEMS should use 3001 (`next start --port 3001`).

- **API won’t start:** Check `apps/api/.env`, DATABASE_URL and JWT_SECRET. In production, JWT_SECRET must be at least 64 characters and CORS_ORIGIN must not be `*`.
- **Frontend can’t reach API:** Ensure NEXT_PUBLIC_API_URL matches the URL the browser uses (domain or IP + port). If using Nginx, use the same host and path (e.g. `/api/v1`).
- **502 Bad Gateway:** Backend not running or wrong port. Check `pm2 status` and that API listens on 3000 and GEMS on 3001.
- **"Application error" / ChunkLoadError / 404 on `_next/static/chunks/...`:** This happens after a new frontend build when the browser or server still uses old chunk filenames. **Fix:** (1) Restart the frontend so it serves the new build: `pm2 restart gems` (or `pm2 restart api gems` to restart both). (2) Hard-refresh the page (Ctrl+Shift+R or Cmd+Shift+R) or clear the site's cache so the browser loads the new HTML and chunk URLs.
- **Login or register returns 500 / "An unexpected error occurred":** The DB schema is often missing tenant isolation or audit columns. **Fix:** Run migrations from repo root: `bash scripts/run-migrations.sh`. Migrations 001 (base tables + system tenant), 002 (tenant_id on users/refresh_tokens), and 018 (audit_logs columns for API) must run. Then restart the API: `pm2 restart api`.
- **Logs:** `pm2 logs api` and `pm2 logs gems`.

Never commit `.env` or `.env.local`; they contain secrets. Use a secrets manager or set env vars in PM2/Systemd if you prefer not to keep `.env` files on disk.
