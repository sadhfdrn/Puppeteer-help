# Use a base image that has Node.js and Chromium pre-installed.
# The browserless/chrome image is a good choice for this.
FROM browserless/chrome

# Set the working directory inside the container
WORKDIR /usr/src/app

# Set the executable path for Puppeteer
# This tells puppeteer-core to use the Chromium instance included in the base image.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV GOOGLE_API_KEY=AIzaSyBUVv3_99ywbdcl3kdUqVqab-r5mWGFYjw

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Your application's main file is server.js
# Expose the port the app runs on
EXPOSE 3001

# Command to run the application
CMD [ "npm", "start" ]
