FROM node:20-alpine

WORKDIR /app

# Use Sectra npm registry
RUN npm config set registry https://feeds.sectra.net/npm/

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY data ./data

CMD ["npm", "start"]
