# syntax=docker/dockerfile:1

# Windows lockfiles only record win32 optional natives; `npm ci` in Linux skips linux-* packages (npm#4828).
# Install Linux x64 gnu bindings explicitly so Vite + Tailwind v4 can load in the builder.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Split so logs don’t look “stuck” after `npm ci`: the next install can be slow and silent.
RUN npm ci --no-audit --no-fund

RUN echo "[docker] Installing Linux x64 gnu optional deps for client (Vite / Tailwind)…" \
  && npm install -w client --no-audit --no-fund \
    @rolldown/binding-linux-x64-gnu \
    lightningcss-linux-x64-gnu \
    @tailwindcss/oxide-linux-x64-gnu \
  && echo "[docker] Linux native bindings for client OK"

COPY client client
COPY server server

RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV STEAMCMD_SCRIPT=/opt/steamcmd/steamcmd.sh

RUN DEBIAN_FRONTEND=noninteractive \
  dpkg --add-architecture i386 \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    findutils \
    tar \
    libc6:i386 \
    libstdc++6:i386 \
  && mkdir -p /opt/steamcmd \
  && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
    | tar -xz -C /opt/steamcmd \
  && chmod +x /opt/steamcmd/steamcmd.sh \
  && mkdir -p /root/.steam/sdk64 \
  && echo "[docker] Bootstrapping SteamCMD (downloads steamclient.so; may take a minute)…" \
  && /bin/bash /opt/steamcmd/steamcmd.sh \
    +@sSteamCmdForcePlatformType linux \
    +login anonymous \
    +quit \
  && SC="$(find /opt/steamcmd /root/.steam -name steamclient.so -type f 2>/dev/null | head -n1)" \
  && test -n "$SC" \
  && cp "$SC" /root/.steam/sdk64/steamclient.so \
  && echo "[docker] Installed steamclient.so from $SC" \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci --omit=dev

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./server/static

WORKDIR /app/server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
