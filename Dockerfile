# wifi-heatmapper - production image (Linux hosts only)
#
# The container needs the host's Wi-Fi interface, so it must run with
# --net=host and --privileged. That only works on Linux: on macOS and
# Windows, Docker runs in a VM that cannot see the Wi-Fi adapter, so run
# the app directly on the host there (see README).
#
#   docker build -t wifi-heatmapper .
#   docker run --net=host --privileged \
#     -v ./datas:/app/data \
#     -v /var/run/dbus:/var/run/dbus \
#     wifi-heatmapper
#
# All user data (surveys and floor plans) lives in /app/data.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# iw + nmcli read the Wi-Fi signal, iperf3 measures throughput
RUN apk add --no-cache iw iperf3 networkmanager networkmanager-cli
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
COPY --from=build /app/data/localization ./data/localization
EXPOSE 3000
CMD ["npm", "run", "start"]
