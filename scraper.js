const { connect } = require('puppeteer-real-browser');
const { analyzePageWithAI } = require('./ai/flow.js');

// Configuration constants
const CONFIG = {
  BROWSER_TIMEOUT: 60000,
  PAGE_TIMEOUT: 30000,
  NAVIGATION_TIMEOUT: 60000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000
};

/**
 * Sleep utility function
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
    
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      request.abort();
      return;
    }
    
    if (url.includes('kwik.cx') || url.includes('kwik.sx')) {
      logCallback(`[Puppeteer] Intercepted Kwik URL: ${url}`);
      collectedData.kwik.urls.push(url);
      collectedData.referrer = request.headers().referer || collectedData.referrer;
    }
    
    if (url.includes('.m3u8') || url.includes('stream') || url.includes('video')) {
      logCallback(`[Puppeteer] Intercepted potential stream URL: ${url}`);
      collectedData.streamUrls = collectedData.streamUrls || [];
      collectedData.streamUrls.push(url);
    }
    
    request.continue();
  });
  
  page.on('response', response => {
    const url = response.url();
    
    if (url.includes('api') || url.includes('ajax') || url.includes('stream')) {
      logCallback(`[Puppeteer] Response from: ${url} (${response.status()})`);
    }
  });
}

/**
 * Wait for page to be fully loaded with custom conditions
 * @param {Page} page - Puppeteer page instance
 * @param {Function} logCallback - Logging callback function
 */
async function waitForPageLoad(page, logCallback) {
  try {
    await page.waitForNetworkIdle({idleTime: 1000, timeout: CONFIG.PAGE_TIMEOUT})
    
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
        // Continue
      }
    }
    
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
    const { browser, page } = await connect({
        headless: 'auto',
        turnstile: true,
        args: ['--start-maximized']
    });

    logCallback('[Puppeteer] Browser launched successfully');
    
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
    
    await setupRequestInterception(page, collectedData, logCallback);
    
    logCallback(`[Puppeteer] Navigating to ${url}...`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.NAVIGATION_TIMEOUT });

    logCallback('[Puppeteer] Page loaded successfully');
    collectedData.processingTime.pageLoaded = Date.now();
    
    await waitForPageLoad(page, logCallback);
    
    collectedData.pageInfo = await extractPageInfo(page, logCallback);
    
    logCallback('[Puppeteer] Extracting page content...');
    const pageContent = await page.content();
    collectedData.processingTime.contentExtracted = Date.now();
    
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
    
    if (collectedData.kwik.urls.length > 0) {
      logCallback(`[Puppeteer] Processing ${collectedData.kwik.urls.length} Kwik URLs...`);
      
      const uniqueKwikUrls = [...new Set(collectedData.kwik.urls)];
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
      
      const successCount = kwikResults.filter(result => result.success).length;
      logCallback(`[Puppeteer] Kwik processing completed: ${successCount}/${kwikResults.length} successful`);
    } else {
      logCallback('[Puppeteer] No Kwik URLs were intercepted');
    }
    
    collectedData.processingTime.completed = Date.now();
    collectedData.processingTime.totalDuration = collectedData.processingTime.completed - startTime;
    
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
