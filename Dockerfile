# Use Node.js base image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (to leverage Docker caching)
COPY package*.json ./

# Install needed packages
RUN apk add --no-cache iw iperf3

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the application port (if needed)
EXPOSE 3000

# Default command to start the app
CMD ["npm", "run", "dev"]