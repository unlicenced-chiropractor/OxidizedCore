# OxidizedCore

Web dashboard for running **Rust** dedicated servers from a single container: create instances, set **map seed / size** with a **RustMaps** preview, install the game via **SteamCMD**, start/stop processes, and use **RCON** from the browser.

**Stack:** Vue 3 + Vite · Express 5 · Socket.IO · SQLite · Docker

## Requirements

- **Docker** and **Docker Compose** (recommended), or Node.js **20+** for local development
- On **Windows** (or Linux) without Docker, the app auto-downloads **SteamCMD** and the correct **Rust dedicated** and **Oxide** builds for the host OS
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

**Dynamic Rust ports in Docker:** the engine only forwards ports listed in Compose. By default, **UDP+TCP `28000-28700`** are published in both directions so typical UI ports (and Rust+ companion at `max(game,rcon)+67`) work without editing the file. Set **`OXIDIZED_RUST_PORTS_RANGE`** in `.env` to widen (e.g. `27000-29000`). For **any** port on **Linux**, use host networking:

`docker compose -f docker-compose.yml -f docker-compose.host.yml up -d --build`

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
| `OXIDIZED_RUST_PORTS_RANGE` | `28000-28700` | Host↔container UDP+TCP range for game, query, RCON, Rust+ (bridge mode) |
| `TRUST_PROXY` | `0` | Set `1` behind nginx/Traefik/Caddy |
| `CORS_ORIGIN` | — | Comma-separated origins if you lock CORS |

See comments in [`docker-compose.yml`](docker-compose.yml) and [`server/.env.example`](server/.env.example) for advanced options (`OXIDIZED_APP_PUBLICIP`, `OXIDIZED_SKIP_STEAM_INSTALL`, etc.).

## Ports

Default in-game ports match a new server in the UI (**game 28015**, **RCON 28016**). The app sets **query UDP** to **game+1** (or **game+2** if that would equal RCON). **Rust+ TCP** is `max(game+67, rcon+67)`.

| Port | Protocol | Role |
|------|----------|------|
| 3001 | TCP | Web UI |
| (your game port) | UDP + TCP | Rust game |
| (query) | UDP | Steam query |
| (RCON) | TCP | Web / RCON clients |
| (companion) | TCP | Rust+ mobile |

**Docker (bridge):** Compose publishes **`OXIDIZED_RUST_PORTS_RANGE`** (default **28000–28700**) for both UDP and TCP so new servers in that band are reachable from the internet/LAN. Pick ports inside the range, or widen the env var, or use **`docker-compose.host.yml`** on Linux so the container shares the host network and any port works.

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
docker-compose.host.yml   # Linux: host network for arbitrary Rust ports
Dockerfile
build.bat        # Windows: docker build -t oxidized-core:local .
```

## License

See [LICENSE](LICENSE).
