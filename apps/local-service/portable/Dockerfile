FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
WORKDIR /app/portable
COPY portable/package.json portable/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY portable/src ./src
COPY portable/migrations ./migrations
COPY portable/integration/native-check.js ./integration/native-check.js
COPY src/domain/validation.js src/domain/errors.js /app/src/domain/
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "src/main.js"]
CMD ["api"]
