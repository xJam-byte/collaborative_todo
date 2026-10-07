FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Next.js binds to port 3000 by default. 
EXPOSE 3000

CMD ["npm", "start"]
