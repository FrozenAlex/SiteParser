FROM node:13-alpine

WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available
COPY package*.json ./
COPY yarn.lock ./

RUN yarn install

COPY . .

RUN yarn build

# Prune dev dependencies
RUN rm -rf node_modules && yarn install --production

EXPOSE 8080

CMD [ "node", "./dist/server.js" ]