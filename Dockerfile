FROM node:24-bookworm-slim AS node
FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && npm install --global wrangler@4.130.0
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY scorekeeper_pipeline ./scorekeeper_pipeline
COPY scorekeeper_remote ./scorekeeper_remote
COPY sql ./sql
COPY src ./src
COPY site ./site
COPY build.cjs ./
RUN node build.cjs
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 4 --timeout 240 'scorekeeper_remote.app:create_app()'"]
