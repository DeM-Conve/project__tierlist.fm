FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=http://localhost:8080
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# A template: the image's entrypoint substitutes BACKEND_ORIGIN into conf.d/default.conf.
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV BACKEND_ORIGIN=http://backend:48123
EXPOSE 80
