const puppeteer = require('puppeteer-core');
const { analyzePageWithAI } = require('./ai/flow.js');

// Configuration constants
const CONFIG = {
  BROWSER_TIMEOUT: 60000,
  PAGE_TIMEOUT: 30000,
  NAVIGATION_TIMEOUT: 60000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ]
};

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get random user agent
 * @returns {string} Random user agent string
 */
const getRandomUserAgent = () => {
  return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
};

/**
 * Extract m3u8 URLs from text content
 * @param {string} text - Text content to search
 * @returns {string[]} Array of found m3u8 URLs
 */
const extractM3U8URLs = (text) => {
  const m3u8Regex = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/g;
  return text.match(m3u8Regex) || [];
};

/**
 * Extract various video URLs from text content
 * @param {string} text - Text content to search
 * @returns {Object} Object containing different types of video URLs
 */
const extractVideoURLs = (text) => {
  return {
    m3u8: text.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g) || [],
    mp4: text.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g) || [],
    webm: text.match(/https?:\/\/[^\s"']+\.webm[^\s"']*/g) || [],
    mkv: text.match(/https?:\/\/[^\s"']+\.mkv[^\s"']*/g) || []
  };
};

/**
 * Process Kwik URL with retry logic
 * @param {string} kwikUrl - Kwik URL to process
 * @param {string} referrer - Referrer URL
 * @param {Function} logCallback - Logging callback function
 * @returns {Promise<Object>} Processed Kwik data
 */
async function processKwikURL(kwikUrl, referrer, logCallback) {
  const maxRetries = CONFIG.MAX_RETRIES;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logCallback(`[Kwik] Processing attempt ${attempt}/${maxRetries}: ${kwikUrl}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(kwikUrl, {
        headers: {
          'Referer': referrer,
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const text = await response.text();
      const videoURLs = extractVideoURLs(text);
      
      logCallback(`[Kwik] Found ${Object.values(videoURLs).flat().length} video URLs`);
      
      return {
        originalUrl: kwikUrl,
        videoURLs,
        success: true,
        attempt,
        responseSize: text.length
      };
      
    } catch (error) {
      logCallback(`[Kwik] Attempt ${attempt} failed: ${error.message}`, 'warn');
      
      if (attempt === maxRetries) {
        logCallback(`[Kwik] All attempts failed for ${kwikUrl}`, 'error');
        return {
          originalUrl: kwikUrl,
          error: error.message,
          success: false,
          attempts: maxRetries
        };
      }
      
      // Wait before retrying
      await sleep(CONFIG.RETRY_DELAY * attempt);
    }
  }
}

/**
 * Setup request interception for the page
 * @param {Page} page - Puppeteer page instance
 * @param {Object} collectedData - Data collection object
 * @param {Function} logCallback - Logging callback function
 */
async function setupRequestInterception(page, collectedData, logCallback) {
  await page.setRequestInterception(true);
  
  page.on('request', request => {
    const url = request.url();
    const resourceType = request.resourceType();
    
    // Block unnecessary resources for faster loading
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      request.abort();
      return;
    }
    
    // Intercept streaming URLs
    if (url.includes('kwik.cx') || url.includes('kwik.sx')) {
      logCallback(`[Puppeteer] Intercepted Kwik URL: ${url}`);
      collectedData.kwik.urls.push(url);
      collectedData.referrer = request.headers().referer || collectedData.referrer;
    }
    
    // Look for other streaming patterns
    if (url.includes('.m3u8') || url.includes('stream') || url.includes('video')) {
      logCallback(`[Puppeteer] Intercepted potential stream URL: ${url}`);
      collectedData.streamUrls = collectedData.streamUrls || [];
      collectedData.streamUrls.push(url);
    }
    
    request.continue();
  });
  
  page.on('response', response => {
    const url = response.url();
    
    // Log important responses
    if (url.includes('api') || url.includes('ajax') || url.includes('stream')) {
      logCallback(`[Puppeteer] Response from: ${url} (${response.status()})`);
    }
  });
}

/**
 * Configure browser page with security and performance settings
 * @param {Page} page - Puppeteer page instance
 * @param {Function} logCallback - Logging callback function
 */
async function configurePage(page, logCallback) {
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Set user agent
  await page.setUserAgent(getRandomUserAgent());
  
  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br'
  });
  
  // Block ads and trackers
  await page.evaluateOnNewDocument(() => {
    // Block common ad/tracker domains
    const blockedDomains = [
      'googletagmanager.com',
      'google-analytics.com',
      'googlesyndication.com',
      'facebook.com/tr',
      'doubleclick.net'
    ];
    
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string' && blockedDomains.some(domain => url.includes(domain))) {
        return Promise.reject(new Error('Blocked'));
      }
      return originalFetch.apply(this, args);
    };
  });
  
  // Handle page errors
  page.on('pageerror', error => {
    logCallback(`[Puppeteer] Page error: ${error.message}`, 'warn');
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      logCallback(`[Browser Console] ${msg.text()}`, 'warn');
    }
  });
}

/**
 * Handles DDoS Guard and other interstitial pages.
 * @param {Page} page - Puppeteer page instance
 * @param {Function} logCallback - Logging callback function
 */
async function handleInterstitialPages(page, logCallback) {
  try {
    const title = await page.title();
    if (title.toLowerCase().includes('ddos-guard')) {
      logCallback('[Puppeteer] DDoS-Guard detected. Waiting for it to resolve...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      logCallback('[Puppeteer] DDoS-Guard page likely resolved.');
    }

    // Handle pahe.win redirects
    if (page.url().includes('pahe.win')) {
      logCallback('[Puppeteer] pahe.win redirect detected. Waiting and clicking continue...');
      await sleep(6000); // Wait for the countdown
      const continueButton = await page.$('form button[type=submit]');
      if(continueButton) {
        await continueButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        logCallback('[Puppeteer] Clicked continue on redirect page.');
      }
    }
  } catch (error) {
    logCallback(`[Puppeteer] Could not bypass interstitial page: ${error.message}`, 'warn');
  }
}

/**
 * Wait for page to be fully loaded with custom conditions
 * @param {Page} page - Puppeteer page instance
 * @param {Function} logCallback - Logging callback function
 */
async function waitForPageLoad(page, logCallback) {
  try {
    // Wait for network to be idle
    await page.waitForNetworkIdle({idleTime: 1000, timeout: CONFIG.PAGE_TIMEOUT})
    
    // Wait for common anime site elements
    const selectors = [
      'iframe',
      '[class*="player"]',
      '[class*="video"]',
      '[id*="player"]',
      '[id*="video"]'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        logCallback(`[Puppeteer] Found element: ${selector}`);
        break;
      } catch (error) {
        // Continue to next selector
      }
    }
    
    // Additional wait for dynamic content
    await sleep(3000);
    
  } catch (error) {
    logCallback(`[Puppeteer] Page load timeout, continuing anyway: ${error.message}`, 'warn');
  }
}

/**
 * Extract additional page information
 * @param {Page} page - Puppeteer page instance
 * @param {Function} logCallback - Logging callback function
 * @returns {Promise<Object>} Additional page data
 */
async function extractPageInfo(page, logCallback) {
  try {
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        scripts: Array.from(document.scripts).map(script => ({
          src: script.src,
          hasContent: script.innerHTML.length > 0,
          contentLength: script.innerHTML.length
        })),
        iframes: Array.from(document.querySelectorAll('iframe')).map(iframe => ({
          src: iframe.src,
          id: iframe.id,
          className: iframe.className
        })),
        videoElements: Array.from(document.querySelectorAll('video')).map(video => ({
          src: video.src,
          poster: video.poster,
          id: video.id,
          className: video.className
        }))
      };
    });
    
    logCallback(`[Puppeteer] Page info extracted: ${pageInfo.scripts.length} scripts, ${pageInfo.iframes.length} iframes`);
    return pageInfo;
  } catch (error) {
    logCallback(`[Puppeteer] Error extracting page info: ${error.message}`, 'warn');
    return {};
  }
}

/**
 * Main scraping function for anime sites
 * @param {string} url - URL to scrape
 * @param {Function} logCallback - Logging callback function
 * @returns {Promise<Object>} Scraped data
 */
async function scrapeAnimePahe(url, logCallback) {
  let browser;
  const startTime = Date.now();
  
  logCallback('[Puppeteer] Initializing browser...');
  
  try {
    // Browser launch configuration
    const browserOptions = {
      headless: process.env.NODE_ENV === 'production' ? 'new' : false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: CONFIG.BROWSER_TIMEOUT
    };
    
    browser = await puppeteer.launch(browserOptions);
    logCallback('[Puppeteer] Browser launched successfully');
    
    const page = await browser.newPage();
    
    // Initialize data collection object
    const collectedData = {
      analysis: {},
      downloadLinks: [],
      kwik: {
        urls: [],
        sources: []
      },
      streamUrls: [],
      pageInfo: {},
      referrer: '',
      processingTime: {
        start: startTime
      }
    };

    // Configure page
    await configurePage(page, logCallback);
    
    // Setup request interception
    await setupRequestInterception(page, collectedData, logCallback);
    
    logCallback(`[Puppeteer] Navigating to ${url}...`);
    
    // Navigate with retry logic
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2', 
          timeout: CONFIG.NAVIGATION_TIMEOUT 
        });
        await handleInterstitialPages(page, logCallback);
        break;
      } catch (error) {
        logCallback(`[Puppeteer] Navigation attempt ${attempt} failed: ${error.message}`, 'warn');
        if (attempt === CONFIG.MAX_RETRIES) {
          throw new Error(`Failed to navigate after ${CONFIG.MAX_RETRIES} attempts: ${error.message}`);
        }
        await sleep(CONFIG.RETRY_DELAY * attempt);
      }
    }
    
    logCallback('[Puppeteer] Page loaded successfully');
    collectedData.processingTime.pageLoaded = Date.now();
    
    // Wait for page to fully load
    await waitForPageLoad(page, logCallback);
    
    // Extract page information
    collectedData.pageInfo = await extractPageInfo(page, logCallback);
    
    // Get page content
    logCallback('[Puppeteer] Extracting page content...');
    const pageContent = await page.content();
    collectedData.processingTime.contentExtracted = Date.now();
    
    // AI Analysis
    logCallback('[AI Flow] Sending page content to AI for analysis...');
    try {
      const aiAnalysis = await analyzePageWithAI(pageContent);
      collectedData.analysis = aiAnalysis;
      collectedData.downloadLinks = aiAnalysis.downloadLinks || [];
      logCallback('[AI Flow] AI analysis completed successfully');
    } catch (error) {
      logCallback(`[AI Flow] AI analysis failed: ${error.message}`, 'error');
      collectedData.analysis = {
        error: error.message,
        streamingLogic: 'AI analysis failed',
        downloadLinks: []
      };
    }
    
    collectedData.processingTime.aiAnalysisCompleted = Date.now();
    
    // Process Kwik URLs
    if (collectedData.kwik.urls.length > 0) {
      logCallback(`[Puppeteer] Processing ${collectedData.kwik.urls.length} Kwik URLs...`);
      
      // Remove duplicates
      const uniqueKwikUrls = [...new Set(collectedData.kwik.urls)];
      
      // Process URLs concurrently with limit
      const concurrencyLimit = 3;
      const kwikResults = [];
      
      for (let i = 0; i < uniqueKwikUrls.length; i += concurrencyLimit) {
        const batch = uniqueKwikUrls.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(
          batch.map(kwikUrl => processKwikURL(kwikUrl, collectedData.referrer || url, logCallback))
        );
        kwikResults.push(...batchResults);
      }
      
      collectedData.kwik.sources = kwikResults;
      collectedData.processingTime.kwikProcessingCompleted = Date.now();
      
      // Summary of Kwik processing
      const successCount = kwikResults.filter(result => result.success).length;
      logCallback(`[Puppeteer] Kwik processing completed: ${successCount}/${kwikResults.length} successful`);
    } else {
      logCallback('[Puppeteer] No Kwik URLs were intercepted');
    }
    
    // Final processing time
    collectedData.processingTime.completed = Date.now();
    collectedData.processingTime.totalDuration = collectedData.processingTime.completed - startTime;
    
    // Log performance metrics
    const metrics = {
      navigation: collectedData.processingTime.pageLoaded - startTime,
      contentExtraction: collectedData.processingTime.contentExtracted - collectedData.processingTime.pageLoaded,
      aiAnalysis: collectedData.processingTime.aiAnalysisCompleted - collectedData.processingTime.contentExtracted,
      kwikProcessing: collectedData.processingTime.kwikProcessingCompleted - collectedData.processingTime.aiAnalysisCompleted,
      total: collectedData.processingTime.totalDuration
    };
    
    logCallback(`[Performance] Total: ${metrics.total}ms | Nav: ${metrics.navigation}ms | AI: ${metrics.aiAnalysis}ms | Kwik: ${metrics.kwikProcessing || 0}ms`);
    
    return collectedData;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logCallback(`[Puppeteer] Critical error after ${duration}ms: ${error.message}`, 'error');
    
    // Return partial data if available
    return {
      error: error.message,
      processingTime: {
        failed: Date.now(),
        totalDuration: duration
      },
      analysis: {
        error: error.message,
        streamingLogic: 'Scraping failed due to error',
        downloadLinks: []
      },
      kwik: { urls: [], sources: [] },
      downloadLinks: []
    };
  } finally {
    if (browser) {
      try {
        logCallback('[Puppeteer] Closing browser...');
        await browser.close();
        logCallback('[Puppeteer] Browser closed successfully');
      } catch (error) {
        logCallback(`[Puppeteer] Error closing browser: ${error.message}`, 'warn');
      }
    }
  }
}

module.exports = { 
  scrapeAnimePahe,
  processKwikURL,
  extractVideoURLs,
  CONFIG 
};
