FROM node:14-alpine

WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available
COPY package*.json ./
COPY yarn.lock ./

# the files should be built before building a docker image
RUN yarn install --production --cache-folder ./ycache && rm -rf ./ycache

COPY . .

EXPOSE 8080

CMD [ "node", "./dist/index.js" ]