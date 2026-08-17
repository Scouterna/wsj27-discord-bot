# Dependencies are installed in a separate stage so that .npmrc — which may
# point at an internal registry and hold credentials for it — never becomes a
# layer in the published image.
FROM node:20-alpine AS deps

WORKDIR /app

# .npmrc is optional and gitignored: absent in a fresh clone, so installs go to
# registry.npmjs.org. Create one locally to use an internal npm proxy.
#
# The registry used to be hardcoded here as feeds.sectra.net, which is only
# reachable from inside that corporate network — a CI runner could never build
# this image.
COPY package*.json .npmrc* ./

# `npm ci` is deterministic: it installs exactly package-lock.json and fails if
# package.json disagrees with it. The lockfile records registry.npmjs.org in
# every `resolved` URL, which is what makes it portable — behind the internal
# mirror npm rewrites that host to the configured registry on the fly
# (`replace-registry-host`, default `npmjs`), so one committed lockfile serves
# both networks. Never regenerate it behind the mirror without rewriting those
# URLs back, or builds that cannot see that host break.
#
# npm cannot be trusted to fail the build on its own: when a registry request
# breaks — e.g. a TLS-intercepting proxy — npm 10 can die with "Exit handler
# never called!" and still exit 0, leaving a half-written node_modules. The
# check below refuses to ship an image whose dependencies did not land.
RUN npm ci --omit=dev --no-audit --no-fund \
 && node -e "const fs=require('fs'),{dependencies={}}=require('./package.json');const missing=Object.keys(dependencies).filter(m=>!fs.existsSync('node_modules/'+m+'/package.json'));if(missing.length){console.error('npm ci left dependencies missing: '+missing.join(', '));process.exit(1)}"

FROM node:20-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

# The node images ship an unprivileged `node` user. The bot writes nothing at
# all — no state, no files.
USER node

# Exec form, and node directly rather than via `npm start`, so node is PID 1 and
# receives SIGTERM itself. src/index.js handles SIGTERM with client.destroy();
# under npm that signal reaches a wrapper that does not reliably forward it, and
# the handler never runs.
CMD ["node", "src/index.js"]
