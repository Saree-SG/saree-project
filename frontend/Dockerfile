# Stage 0, "build-stage", based on Bun, to build and compile the frontend
FROM oven/bun:1 AS build-stage

WORKDIR /app

COPY package.json bun.lock /app/

COPY frontend/package.json /app/frontend/

WORKDIR /app/frontend

RUN bun install

COPY ./frontend /app/frontend
ARG VITE_API_URL
# Build id for version/update detection. The build context has no .git dir, so
# pass it from the host, e.g.:
#   docker build --build-arg APP_BUILD=$(git rev-parse --short HEAD) ...
# If omitted, vite.config.ts falls back to a build timestamp.
ARG APP_BUILD
ENV APP_BUILD=$APP_BUILD

RUN bun run build


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1

COPY --from=build-stage /app/frontend/dist/ /usr/share/nginx/html

COPY ./frontend/nginx-ws-map.conf /etc/nginx/conf.d/00-ws-map.conf
COPY ./frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY ./frontend/nginx-backend-not-found.conf /etc/nginx/extra-conf.d/backend-not-found.conf
