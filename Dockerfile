# Use official Node.js image as base
FROM node:18

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Expose the port on which your app will run
EXPOSE 8080

# Command to run the application
CMD ["npm", "run", "start"]
