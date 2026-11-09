# Deployment (single VPS, Docker)

Needs: a Linux VPS with Docker + Compose, a domain, a TLS reverse proxy, an SMTP provider.

## 1. First deploy
1. Copy the repo to the server (git clone).
2. `cp infra/.env.prod.example infra/.env.prod` and fill every value. Use **real** Cloudflare Turnstile keys for your domain and a long random `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Set `BETTER_AUTH_URL` to the public https URL.
3. Google sign-in: add `https://your.domain/api/auth/callback/google` as an authorised redirect URI and your domain as an authorised JavaScript origin in Google Cloud Console.
4. `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build`
   The web container applies database migrations on start (`prisma migrate deploy`).
5. Seed the template catalogue once (and after adding templates):
   `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec web sh -c "cd apps/web && npx prisma db seed"`
6. Put a TLS reverse proxy in front (the app listens on 127.0.0.1:3100). Caddy example:
   ```
   your.domain {
     reverse_proxy 127.0.0.1:3100
   }
   ```
   See "Trusted proxy" below: the proxy must overwrite the client IP header.

## Trusted proxy (rate limiting)
Login, sign-up and reset limits are keyed by client IP, read from the header named in `CLIENT_IP_HEADER` (default `x-forwarded-for`). A client can send any value in that header, so the proxy **must overwrite it** with the real address:
- Caddy: `reverse_proxy` replaces untrusted `X-Forwarded-For` by default (Caddy 2.5+); do not add `trusted_proxies` unless Cloudflare is in front.
- nginx: `proxy_set_header X-Forwarded-For $remote_addr;` (not `$proxy_add_x_forwarded_for`).
- Behind Cloudflare: set `CLIENT_IP_HEADER=cf-connecting-ip` and allow only Cloudflare's addresses to reach the server.
Check it: send `curl -H "X-Forwarded-For: 1.2.3.4" https://your.domain/api/auth/get-session` repeatedly with a wrong login and confirm the limit still triggers per your real IP, not per the forged one.
- The app port is bound to 127.0.0.1, so it cannot be reached around the proxy.

## 2. Updates
`git pull && docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build`
Migrations run automatically. Take a backup first.

## 3. Backups
`sh scripts/backup.sh` writes `backups/<UTC timestamp>/db.dump` (pg_dump custom format) and `uploads.tar`, and keeps the newest 14.
Schedule daily with cron, then **copy `backups/` off the server** (rsync or object storage): a backup on the same disk is not a backup.
`sh scripts/restore.sh backups/<timestamp>` restores (asks for confirmation). **Test a restore on a scratch server before you need it.**

## 4. Things only you can do
- Real Turnstile keys, SMTP provider, Google OAuth production redirect URI, domain DNS and TLS.
- Open in real Adobe Illustrator the `.ai` / `.eps` files for each version you support, then set `tested: true` in `packages/render-print/src/profiles.ts`.
- Ask your printer to confirm the built-in default dimensions (flap sizes, glue widths, slot widths) listed in `docs/dieline-math.md`.
