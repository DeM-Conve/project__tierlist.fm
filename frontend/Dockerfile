FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# No API URL is baked in: the bundle calls its own origin (nginx proxies /api/
# and the login paths), so one image works at any host, port or scheme.
# BASE_PATH (e.g. /tierlist.fm, from TIERLIST_BASE_PATH) is the one exception:
# the sub-path the app is served under, baked into the bundle's URLs.
ARG BASE_PATH=
ENV BASE_PATH=$BASE_PATH
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# A template: the image's entrypoint substitutes BACKEND_ORIGIN into conf.d/default.conf.
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_ORIGIN=http://backend:48123
EXPOSE 80
