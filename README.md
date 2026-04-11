# OxidizedCore

Web dashboard for running **Rust** dedicated servers from a single container: create instances, set **map seed / size** with a **RustMaps** preview, install the game via **SteamCMD**, start/stop processes, and use **RCON** from the browser.

**Stack:** Vue 3 + Vite · Express 5 · Socket.IO · SQLite · Docker

## Requirements

- **Docker** and **Docker Compose** (recommended), or Node.js **20+** for local development
- Enough disk space for the Rust dedicated server (~15 GB+ under the data volume)
- Open **firewall / router** ports for game **UDP**, query **UDP**, **RCON TCP**, and optional **Rust+ TCP** (see [Ports](#ports))

## Quick start (Docker)

From the repo root:

```bash
docker compose up -d --build
```

Open **http://localhost:3001** (or `http://<host>:3001`).

1. **Settings** — add your [RustMaps](https://rustmaps.com/dashboard) API key (used only for map thumbnails when adding a server). The key is stored in SQLite on the data volume.
2. **Servers** — **Add server**, load a map preview, then create. **Start** when the Steam install has finished (first run can take a while).

On Windows you can use `build.bat` to build the image, then `docker compose up -d`.

### Data layout (volume `oxidized-core-data` → `/data`)

| Path | Purpose |
|------|---------|
| `oxidized.db` | SQLite (servers, settings) |
| `instances/<slug>/` | Per-server logs and panel files |
| `instances/_shared/rust-dedicated/` | Shared **RustDedicated** + Steam `steamapps` |
| `instances/_shared/steamcmd/` | Optional auto-bootstrapped SteamCMD cache |

### Environment (optional)

Compose reads variables from a `.env` file next to `docker-compose.yml`. Common options:

| Variable | Default | Notes |
|----------|---------|--------|
| `OXIDIZED_PORT` | `3001` | Published web UI port |
| `TRUST_PROXY` | `0` | Set `1` behind nginx/Traefik/Caddy |
| `CORS_ORIGIN` | — | Comma-separated origins if you lock CORS |

See comments in [`docker-compose.yml`](docker-compose.yml) and [`server/.env.example`](server/.env.example) for advanced options (`OXIDIZED_APP_PUBLICIP`, `OXIDIZED_SKIP_STEAM_INSTALL`, etc.).

## Ports

Default in-game ports match a new server in the UI (**game 28015**, **RCON 28016**). The app sets **query UDP** to **28017** so it does not collide with RCON.

| Port | Protocol | Role |
|------|----------|------|
| 3001 | TCP | Web UI |
| 28015 | UDP (+ TCP mapped) | Rust game |
| 28017 | UDP | Steam query |
| 28016 | TCP | RCON (web) |
| 28083 | TCP | Rust+ companion (default for 28015/28016) |

If you add **multiple servers** with different ports, extend the `ports:` section in Compose to match.

## Local development

```bash
npm install
cp server/.env.example server/.env   # adjust as needed
npm run dev
```

- Client: Vite dev server (e.g. http://localhost:5173)
- API: Express (see `PORT` in `server/.env`); set `CLIENT_ORIGIN` to the Vite URL for CORS

Production build:

```bash
npm run build
npm start
```

Serve the built UI from the server with `SERVE_STATIC=1` (typical in Docker).

## Project layout

```
client/          # Vue 3 SPA
server/          # Express API, supervisor, Steam/Rust integration
docker-compose.yml
Dockerfile
build.bat        # Windows: docker build -t oxidized-core:local .
```

## License

See [LICENSE](LICENSE).
