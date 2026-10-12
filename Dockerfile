# Builds the static site and serves it with nginx on port 80 (Coolify on tsss-server, task 05).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build asks GitHub for rustyAC's releases and downloads the browser preview of the newest one
# (scripts/fetch-web-preview.mjs), so this stage needs to reach api.github.com and github.com. When it
# cannot, the build still passes: the pages use src/data/release-fallback.json and /play says the
# preview is unavailable.
# GITHUB_TOKEN is optional (a higher rate limit). It is set for this one command only: it is not in
# the image's environment, and the final image below is a different stage.
ARG GITHUB_TOKEN=""
# Docker reuses this stage's cached result while the site's own files are unchanged, so a new rustyAC
# release would never be picked up by a plain redeploy. Fetching the latest release's record here
# makes the build run again whenever it changes (it also changes with the download counts, so in
# practice every deploy fetches the newest preview).
ADD https://api.github.com/repos/thesupersupersigma/rustyAC/releases/latest /app/node_modules/.cache/latest-release.json
RUN GITHUB_TOKEN="$GITHUB_TOKEN" npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
