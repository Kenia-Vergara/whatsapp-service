FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Expone el puerto definido en .env o por defecto 5111
EXPOSE 5111

CMD ["node", "index.js"]