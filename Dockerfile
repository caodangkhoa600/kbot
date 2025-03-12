FROM node:22

WORKDIR /src
COPY package.json .
RUN npm install\
  && npm install typescript -g
COPY . .

RUN npm run build

CMD ["npm", "start"]
