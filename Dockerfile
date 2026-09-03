# ---- Стадия 1: исходники Superset + плагин + сборка фронтенда ----
FROM node:22-trixie-slim AS frontend-builder

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    NODE_OPTIONS=--max_old_space_size=8192

RUN apt-get update && apt-get install -y --no-install-recommends \
        git python3 rsync build-essential zstd ca-certificates jq \
        && rm -rf /var/lib/apt/lists/*

ARG SUPERSET_BRANCH=6.1.0

RUN git clone --depth 1 --branch ${SUPERSET_BRANCH} \
        https://github.com/apache/superset.git /build/superset

WORKDIR /build/superset

COPY . /build/checkbox-plugin

RUN chmod +x /build/checkbox-plugin/install.sh \
        && /build/checkbox-plugin/install.sh /build/superset

WORKDIR /build/superset/superset-frontend

RUN mkdir -p /build/superset/superset/static/assets \
        && npm install --no-audit --no-fund

RUN npm run build

# ---- Стадия 2: продакшн-образ ----
FROM apache/superset:6.1.0

USER root

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libldap2-dev libsasl2-dev python3-dev \
        && uv pip install psycopg2-binary redis python-ldap playwright \
        && playwright install-deps \
        && playwright install chromium \
        && chmod -R a+rX /opt/playwright \
        && rm -rf /var/lib/apt/lists/*

RUN rm -rf /app/superset/static/assets/*

COPY --from=frontend-builder /build/superset/superset/static/assets/ /app/superset/static/assets/
RUN chown -R superset:superset /app/superset/static/assets

USER superset
