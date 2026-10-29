# christiansystems.org and Social. Node 24, no packages to install.
FROM node:24-slim
WORKDIR /app
LABEL org.opencontainers.image.licenses="GPL-3.0-only"
COPY package.json server.mjs LICENSE ./
COPY social ./social
COPY site ./site
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server.mjs"]
