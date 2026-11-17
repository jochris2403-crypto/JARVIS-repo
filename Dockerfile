# JARVIS production image: one Node process serving the API and the built web app.
#   docker build -t jarvis .
#   docker run -p 4310:4310 -v jarvis-data:/data \
#     -e JARVIS_AUTH_PASSWORD='choose-a-strong-password' \
#     -e JARVIS_PUBLIC_ORIGIN='http://<this-machine-ip>:4310' jarvis
# See DEPLOYMENT.md for every option.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-slim
ENV NODE_ENV=production \
    JARVIS_HOST=0.0.0.0 \
    JARVIS_DATA_DIR=/data
WORKDIR /app
# Same layout as the repository: the server resolves the web app at ../../web/dist and
# @jarvis/shared through the workspace link in node_modules.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/web/dist apps/web/dist
# Saved connections, encrypted passwords and the key file live here. Mount a persistent
# volume at /data or they are lost on every redeploy. (Runs as root because platform
# volumes are usually root-owned.)
RUN mkdir -p /data
EXPOSE 4310
CMD ["node", "--enable-source-maps", "apps/server/dist/index.js"]
