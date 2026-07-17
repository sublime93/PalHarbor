# syntax=docker/dockerfile:1.7
FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS base

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    corepack pnpm@11.4.0 --pm-on-fail=ignore install --frozen-lockfile
RUN corepack pnpm@11.4.0 --pm-on-fail=ignore --filter @app/database build
RUN corepack pnpm@11.4.0 --pm-on-fail=ignore --filter @app/web build
RUN corepack pnpm@11.4.0 --pm-on-fail=ignore --filter @app/api build
RUN corepack pnpm@11.4.0 --pm-on-fail=ignore --filter @app/api --prod deploy /prod/api
RUN mkdir -p /prod/web && cp -R apps/web/dist /prod/web/dist

FROM base AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4174
WORKDIR /prod/api

COPY --from=build /prod/api /prod/api
COPY --from=build /prod/web /prod/web

RUN mkdir -p /prod/api/data && chown -R node:node /prod
USER node
EXPOSE 4174
VOLUME ["/prod/api/data"]

CMD ["node", "dist/server.js"]
