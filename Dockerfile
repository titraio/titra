FROM node:22.22
ENV METEOR_ALLOW_SUPERUSER true
RUN curl https://install.meteor.com/\?release\=3.3 | sh
RUN meteor --version
WORKDIR /app/
COPY package.json .
COPY package-lock.json .
RUN meteor npm ci
COPY public/ ./public/
COPY server/ ./server/
COPY client/ ./client/
COPY imports/ ./imports/
COPY .meteor/ ./.meteor/
ENV DISABLE_CLIENT_STATS true
ENV METEOR_DISABLE_OPTIMISTIC_CACHING 1
RUN meteor build /build/ --server-only

FROM node:22.22-alpine
RUN apk --no-cache add \
	bash \
    curl \
	g++ \
	make \
	python3
COPY --from=0 /build/*.tar.gz /app/bundle.tar.gz
WORKDIR /app/
RUN tar xvzf bundle.tar.gz
RUN cd /app/bundle/programs/server; npm ci --silent --prefer-offline --no-audit; npm prune --production;
RUN curl -sfL https://gobinaries.com/tj/node-prune -o /tmp/node-prune.sh
RUN chmod +x /tmp/node-prune.sh
RUN /tmp/node-prune.sh
RUN rm -rf /app/bundle/programs/server/npm/node_modules/meteor/babel-compiler/node_modules/typescript
RUN rm -rf /app/bundle/programs/server/npm/node_modules/meteor/babel-compiler/node_modules/@babel
RUN rm -rf /app/bundle/programs/server/npm/node_modules/@neovici/nullxlsx/cc-test-reporter
RUN rm -rf /app/bundle/programs/server/npm/node_modules/moment/locale
RUN rm -rf /app/bundle/programs/server/npm/node_modules/moment/dist/locale
RUN rm -rf /app/bundle/programs/server/npm/node_modules/moment/src/locale
RUN find /app/bundle/programs/server/npm/node_modules/astronomia/data/ -type f -not -name "deltat.js" -or -name "vsop87Bearth.js" -delete
RUN find /app/bundle/programs/server/npm/node_modules/astronomia/lib/data/ -type f -not -name "deltat.js" -or -name "vsop87Bearth.js" -delete

FROM node:22.22-alpine
RUN apk --no-cache add \
	bash \
	ca-certificates
ENV PORT 3000
EXPOSE 3000
WORKDIR /app/
COPY --from=1 app/bundle bundle
COPY entrypoint.sh /docker/entrypoint.sh
RUN chown -R node:node /app
USER node
ENTRYPOINT ["/docker/entrypoint.sh"]
CMD ["node", "bundle/main.js"]
