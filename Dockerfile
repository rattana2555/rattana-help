# RATTANA HELP — production image (Node 24 has SQLite built in; no npm install needed)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data/db \
    UPLOAD_DIR=/data/uploads \
    TRUST_PROXY=1 \
    SEED_DEMO=0
COPY package.json server.js db.js ./
COPY public ./public
COPY scripts ./scripts
# Mount a persistent volume at /data — the database and every uploaded photo live there
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
