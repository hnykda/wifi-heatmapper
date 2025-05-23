# Dockerfile - only works on Linux

# If you're on macOS or Windows, --privileged does not expose host hardware
# (e.g., Wi-Fi interfaces) and network_mode: host is ignored.
# You’d need to run the app directly on the host OS or in a Linux VM
# (like WSL2 or a remote dev server).

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

