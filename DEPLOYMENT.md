# Deploying JARVIS

JARVIS runs as **one Node.js process** that serves both the API and the built web app. To use it from another machine, run that process somewhere the other machine can reach, with a login turned on.

> **Netlify and Vercel are not suitable.** They host static files and short-lived serverless functions. JARVIS needs a long-running process (it keeps MySQL connection pools open) and a persistent disk (saved connections and encrypted passwords). Use one of the options below instead.

## What every deployment needs

| Variable                   | Required                  | Purpose                                                                                                                                                                    |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JARVIS_AUTH_PASSWORD`     | **yes**                   | Turns on the sign-in screen (min. 8 characters). JARVIS refuses to start on a network interface without it.                                                                |
| `JARVIS_AUTH_USERNAME`     | no (default `admin`)      | Sign-in username.                                                                                                                                                          |
| `JARVIS_HOST`              | yes                       | `0.0.0.0` to accept connections from other machines (the Docker image sets this).                                                                                          |
| `JARVIS_PUBLIC_ORIGIN`     | yes, unless auto-detected | The URL(s) people type, comma-separated, e.g. `http://192.168.1.20:4310`. Requests addressed to other hosts are rejected. Railway and Fly URLs are detected automatically. |
| `JARVIS_DATA_DIR`          | yes on a host             | Where saved connections live. Must be on a **persistent** disk/volume (the Docker image uses `/data`).                                                                     |
| `JARVIS_SECRET_KEY`        | strongly recommended      | 32-byte key encrypting stored passwords: `openssl rand -base64 32`. If unset, a key file is created in the data dir. Never change it afterwards.                           |
| `JARVIS_TRUST_PROXY`       | behind a proxy            | `1` on Railway, Fly or behind nginx/Caddy, so client IPs and https are detected correctly. Leave unset otherwise.                                                          |
| `JARVIS_SESSION_TTL_HOURS` | no (default 12)           | How long a sign-in lasts.                                                                                                                                                  |
| `PORT` / `JARVIS_PORT`     | no (default 4310)         | Listening port. Platforms set `PORT` themselves.                                                                                                                           |

**The MySQL server must be reachable from wherever JARVIS runs.** A cloud host cannot reach a database on your laptop or office network (for example the dev instance on port 3307). Use a database that is reachable from the internet, or run JARVIS inside the same network as the database.

---

## Option 1 — Another machine on your network (quickest, no account needed)

Run JARVIS on one computer and open it from others on the same Wi-Fi/LAN.

```bash
npm ci
npm run build

# Find this machine's LAN address (macOS: ipconfig getifaddr en0; Linux: hostname -I)
NODE_ENV=production \
JARVIS_HOST=0.0.0.0 \
JARVIS_PUBLIC_ORIGIN=http://192.168.1.20:4310 \
JARVIS_AUTH_PASSWORD='choose-a-strong-password' \
npm start
```

Then open `http://192.168.1.20:4310` from the other machine and sign in as `admin`. You can put these variables in `.env` instead (see `.env.example`); `npm start` reads it.

On macOS, allow incoming connections for `node` if the firewall asks. Traffic is plain http on the LAN, so use this only on a network you trust.

## Option 2 — Railway

1. **New Project → Deploy from GitHub repo.** Railway builds the `Dockerfile`.
2. Add a **Volume** mounted at `/data`.
3. Variables: `JARVIS_AUTH_PASSWORD`, `JARVIS_SECRET_KEY` (`openssl rand -base64 32`), `JARVIS_TRUST_PROXY=1`.
4. **Settings → Networking → Generate Domain.** The domain is detected automatically through `RAILWAY_PUBLIC_DOMAIN`.

## Option 3 — Fly.io

```bash
fly launch --no-deploy            # detects the Dockerfile; set internal port 4310
fly volumes create jarvis_data --size 1
# in fly.toml:  [mounts] source = "jarvis_data"  destination = "/data"
fly secrets set JARVIS_AUTH_PASSWORD='…' JARVIS_SECRET_KEY="$(openssl rand -base64 32)" JARVIS_TRUST_PROXY=1
fly deploy
```

`https://<app>.fly.dev` is detected automatically through `FLY_APP_NAME`.

## Option 4 — Any server with Docker (VPS, office server)

```bash
docker build -t jarvis .
docker run -d --name jarvis --restart unless-stopped \
  -p 4310:4310 -v jarvis-data:/data \
  -e JARVIS_AUTH_PASSWORD='choose-a-strong-password' \
  -e JARVIS_SECRET_KEY="$(openssl rand -base64 32)" \
  -e JARVIS_PUBLIC_ORIGIN='http://<server-ip>:4310' \
  jarvis
```

For internet access, put Caddy or nginx in front for https, set `JARVIS_PUBLIC_ORIGIN=https://your-domain` and `JARVIS_TRUST_PROXY=1`, and do not publish port 4310 directly.

---

## Security model of a deployment

- One shared account. Anyone who signs in sees and uses every saved connection.
- Use a MySQL account with only the privileges JARVIS users should have; the database's grants are the real boundary.
- Over plain http (Option 1), the password and data travel unencrypted on the local network. Use https for anything internet-facing.
- Sessions last `JARVIS_SESSION_TTL_HOURS`. Changing `JARVIS_AUTH_PASSWORD` signs everyone out.
- Ten failed sign-ins from one address lock that address out for 15 minutes.

## Troubleshooting

| Symptom                                                                         | Fix                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server exits: `JARVIS_AUTH_PASSWORD: required when JARVIS_HOST is not loopback` | Set `JARVIS_AUTH_PASSWORD`.                                                                                                                                |
| `JARVIS does not accept requests addressed to <host>`                           | Add the exact URL you open (scheme, host, port) to `JARVIS_PUBLIC_ORIGIN`.                                                                                 |
| Sign-in succeeds but you are sent back to the sign-in screen                    | You opened an `http://` URL that is listed as `https://` in `JARVIS_PUBLIC_ORIGIN` (the cookie is marked Secure). Use the https URL, or list the http one. |
| Saved connections disappear after a redeploy                                    | `JARVIS_DATA_DIR` is not on a persistent volume.                                                                                                           |
| "The stored password could not be decrypted"                                    | `JARVIS_SECRET_KEY` (or the key file) changed. Restore it, or re-enter the connection passwords.                                                           |
| Cannot connect to MySQL from the hosted app                                     | The database is not reachable from the host. Check its firewall / bind address / allowed IPs.                                                              |
