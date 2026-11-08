# Project Hub

A landing page to show off, open and monitor every project, with live health checks.

- `public/` is the site: plain HTML, CSS and JS, with no build step.
- `public/projects.json` defines every project: copy, stats, links, pipeline stage and the environments to monitor.
- `server.mjs` is a Node server with no dependencies. It serves `public/` and runs the monitor:
  - Every environment's health URL is checked each minute. Uptime history is kept for 7 days in `DATA_DIR/history.json`.
  - Live metrics, such as Yoga DB's pose counts, are refreshed every 10 minutes.
  - GitHub stats (commits, languages, last push) are refreshed hourly. Set `GITHUB_TOKEN` to raise the rate limit.
  - Everything is served at `GET /api/status`.

Without the server, for example on static hosting, the page falls back to browser probes. These show reachability and latency, but no versions, uptime history or GitHub stats.

## Run locally

```bash
node server.mjs   # Node 20+, then open http://localhost:8080
```

## Add or update a project

Edit `public/projects.json`:

- `stage` is an index into `stages`, from `0` (Concept) to `4` (Live).
- Projects at the last stage appear as featured cards and in the live monitor. Earlier stages appear under "Up next".
- When a project ships, add its `environments` with `health` URLs, add a `screenshot`, and set `stage` to `4`.

## Deploy on the Oracle server

`deploy/deploy.sh` uploads the site to `/opt/apps/hub` over SSH and starts it with Docker Compose. The server's shared `caddy-docker-proxy` picks up the container from its labels and issues HTTPS. Don't restart `proxy-caddy-1`, because every site goes through it.

```bash
ORACLE_HOST=129.159.8.242 ORACLE_SSH_KEY="$(cat ~/.ssh/hub_deploy)" ./deploy/deploy.sh
```

### Automatic deploys from GitHub

`.github/workflows/deploy.yml` runs `deploy.sh` on every push to `main`. It needs these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ORACLE_HOST` | `129.159.8.242` |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | a private key whose public half is in the server's `~/.ssh/authorized_keys` |
| `ORACLE_KNOWN_HOSTS` | optional: output of `ssh-keyscan 129.159.8.242`, to pin the server's identity |

Optionally set the repository variable `HUB_HOST` to serve the hub on another hostname.
