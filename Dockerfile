FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Prioriza IPv4 en Node por si el entorno tiene IPv6 “raro”
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY package.json ./
RUN npm i --omit=dev
COPY bridge.js ./
CMD ["node", "bridge.js"]
