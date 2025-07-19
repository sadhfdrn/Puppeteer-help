FROM browserless/chrome

WORKDIR /usr/src/app

# Set base environment variables
ENV GOOGLE_API_KEY=AIzaSyBUVv3_99ywbdcl3kdUqVqab-r5mWGFYjw
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Detect and cache the browserless Chromium path at build time
RUN echo "🔍 Detecting browserless Chromium installation..." && \
    BROWSERLESS_CHROME_PATH="" && \
    for path in "/usr/bin/google-chrome" "/usr/bin/google-chrome-stable" "/usr/bin/chromium" "/usr/bin/chromium-browser"; do \
        if [ -x "$path" ]; then \
            BROWSERLESS_CHROME_PATH="$path"; \
            break; \
        fi \
    done && \
    if [ -n "$BROWSERLESS_CHROME_PATH" ]; then \
        echo "✅ Found browserless Chromium at: $BROWSERLESS_CHROME_PATH" && \
        echo "$BROWSERLESS_CHROME_PATH" > /usr/src/app/.chromium_path && \
        echo "PUPPETEER_EXECUTABLE_PATH=$BROWSERLESS_CHROME_PATH" >> /etc/environment && \
        "$BROWSERLESS_CHROME_PATH" --version; \
    else \
        echo "❌ Browserless Chromium not found!" && \
        exit 1; \
    fi

# Copy package files for better caching
COPY package*.json ./

# Install dependencies (cached layer unless package.json changes)
RUN npm ci --only=production && \
    npm cache clean --force

# Create optimized startup script
RUN echo '#!/bin/bash' > /usr/src/app/start.sh && \
    echo 'set -e' >> /usr/src/app/start.sh && \
    echo '' >> /usr/src/app/start.sh && \
    echo '# Load the cached Chromium path' >> /usr/src/app/start.sh && \
    echo 'if [ -f /usr/src/app/.chromium_path ]; then' >> /usr/src/app/start.sh && \
    echo '    CHROMIUM_PATH=$(cat /usr/src/app/.chromium_path)' >> /usr/src/app/start.sh && \
    echo '    echo "✅ Using cached browserless Chromium: $CHROMIUM_PATH"' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_PATH"' >> /usr/src/app/start.sh && \
    echo '    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /usr/src/app/start.sh && \
    echo 'else' >> /usr/src/app/start.sh && \
    echo '    echo "❌ Chromium path cache not found!"' >> /usr/src/app/start.sh && \
    echo '    exit 1' >> /usr/src/app/start.sh && \
    echo 'fi' >> /usr/src/app/start.sh && \
    echo '' >> /usr/src/app/start.sh && \
    echo 'echo "🚀 Starting application with Chromium: $PUPPETEER_EXECUTABLE_PATH"' >> /usr/src/app/start.sh && \
    echo 'exec npm start' >> /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Copy application code (this layer changes most frequently)
COPY . .

EXPOSE 3001

# Health check using the cached Chromium path
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD CHROMIUM_PATH=$(cat /usr/src/app/.chromium_path 2>/dev/null || echo "") && \
        if [ -n "$CHROMIUM_PATH" ]; then \
            node -e "const puppeteer = require('puppeteer-core'); (async () => { try { const browser = await puppeteer.launch({executablePath: '$CHROMIUM_PATH', args: ['--no-sandbox', '--disable-setuid-sandbox']}); await browser.close(); } catch(e) { console.error(e); process.exit(1); } })()"; \
        else \
            echo "Health check failed: No Chromium path"; exit 1; \
        fi

CMD ["/usr/src/app/start.sh"]
