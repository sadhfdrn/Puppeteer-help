# Use a base image that has Node.js and Chromium pre-installed.
# The browserless/chrome image is a good choice for this.
FROM browserless/chrome

# Set the working directory inside the container
WORKDIR /usr/src/app

# Set the executable path for Puppeteer
# This tells puppeteer-core to use the Chromium instance included in the base image.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV GOOGLE_API_KEY=AIzaSyBUVv3_99ywbdcl3kdUqVqab-r5mWGFYjw

# Skip Puppeteer's Chromium download since we're using the base image's Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create a startup script that checks for existing Chromium
RUN echo '#!/bin/bash' > /usr/src/app/start.sh && \
    echo 'set -e' >> /usr/src/app/start.sh && \
    echo '' >> /usr/src/app/start.sh && \
    echo '# Check if Chrome/Chromium is already available' >> /usr/src/app/start.sh && \
    echo 'if command -v google-chrome >/dev/null 2>&1; then' >> /usr/src/app/start.sh && \
    echo '    echo "Chrome found at: $(which google-chrome)"' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /usr/src/app/start.sh && \
    echo 'elif command -v chromium >/dev/null 2>&1; then' >> /usr/src/app/start.sh && \
    echo '    echo "Chromium found at: $(which chromium)"' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_EXECUTABLE_PATH=$(which chromium)' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /usr/src/app/start.sh && \
    echo 'elif command -v chromium-browser >/dev/null 2>&1; then' >> /usr/src/app/start.sh && \
    echo '    echo "Chromium-browser found at: $(which chromium-browser)"' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_EXECUTABLE_PATH=$(which chromium-browser)' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /usr/src/app/start.sh && \
    echo 'else' >> /usr/src/app/start.sh && \
    echo '    echo "No Chrome/Chromium found, Puppeteer will download its own"' >> /usr/src/app/start.sh && \
    echo '    unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD' >> /usr/src/app/start.sh && \
    echo 'fi' >> /usr/src/app/start.sh && \
    echo '' >> /usr/src/app/start.sh && \
    echo '# Start the application' >> /usr/src/app/start.sh && \
    echo 'exec npm start' >> /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Use npm ci for faster, reliable, reproducible builds
# npm ci is designed for automated environments and installs from package-lock.json
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Your application's main file is server.js
# Expose the port the app runs on
EXPOSE 3001

# Use the startup script instead of direct npm start
CMD [ "/usr/src/app/start.sh" ]
