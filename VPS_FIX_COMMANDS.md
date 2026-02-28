# VPS Fix Commands - 401 Login/Signup & Health Route

Run these commands **on your VPS** in order. Replace `YOUR_VPS_IP` with your actual droplet IP (e.g. from DigitalOcean dashboard).

---

## 1. Fix Nginx Symlink (the previous command had a typo)

```bash
sudo ln -sf /etc/nginx/sites-available/gems /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 2. Fix GEMS .env.local with Your Actual VPS IP

**CRITICAL:** `NEXT_PUBLIC_API_URL` is baked in at **build time**. You MUST set it correctly and **rebuild** GEMS.

```bash
# Replace 164.92.71.218 with your actual VPS IP (from DigitalOcean or: curl -4 ifconfig.me)
cd /var/gems/apps/gems
echo 'NEXT_PUBLIC_API_URL=http://164.92.71.218/api/v1' > .env.local
cat .env.local
```

---

## 3. Fix API .env CORS_ORIGIN

Ensure CORS_ORIGIN matches the URL you use to access the site. Use your VPS IP:

```bash
cd /var/gems/apps/api
nano .env
# Set CORS_ORIGIN=http://164.92.71.218
# Or if you have a domain: CORS_ORIGIN=http://yourdomain.com,https://yourdomain.com,http://164.92.71.218
```

---

## 4. Rebuild GEMS (required after changing .env.local)

```bash
cd /var/gems/apps/gems
npm run build
```

---

## 5. Restart Both API and GEMS

```bash
cd /var/gems
pm2 restart api gems
pm2 save
```

---

## 6. Verify

```bash
# Health check (try both)
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/v1/health

# From outside (replace with your IP)
curl -s http://164.92.71.218/api/v1/health
```

---

## 7. Check Logs if Still 401

```bash
pm2 logs api
# Press Ctrl+C to exit
```

---

## Summary of Causes

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 on login | Wrong credentials OR CORS/API URL | Use correct email/password; fix CORS_ORIGIN and NEXT_PUBLIC_API_URL |
| 401 on signup | NEXT_PUBLIC_API_URL wrong (e.g. `YOUR_VPS_IP` literal) | Set real IP in .env.local and rebuild |
| Health 404 | Route config / build | Rebuild API and restart |
| Nginx default page | Symlink not created | Run step 1 |
