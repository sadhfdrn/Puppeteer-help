
const puppeteer = require('puppeteer-core');
const { analyzePageWithAI } = require('./ai/flow.js');

async function scrapeAnimePahe(url, logCallback) {
    let browser;
    logCallback('[Puppeteer] Launching browser...');
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        
        const collectedData = {
            analysis: {},
            downloadLinks: [],
            kwik: {
                urls: [],
                sources: []
            },
            referrer: '',
        };

        page.on('request', request => {
            const reqUrl = request.url();
            if (reqUrl.includes('kwik.cx')) {
                logCallback(`[Puppeteer] Intercepted Kwik URL: ${reqUrl}`);
                collectedData.kwik.urls.push(reqUrl);
                collectedData.referrer = request.headers().referer;
            }
        });
        
        logCallback(`[Puppeteer] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        logCallback('[Puppeteer] Page loaded. Getting content...');
        
        const pageContent = await page.content();

        logCallback('[AI Flow] Sending page content to AI for analysis...');
        const aiAnalysis = await analyzePageWithAI(pageContent);
        collectedData.analysis = aiAnalysis;
        logCallback('[AI Flow] Received insights from AI.');

        collectedData.downloadLinks = aiAnalysis.downloadLinks || [];

        if (collectedData.kwik.urls.length > 0) {
            logCallback(`[Puppeteer] Found ${collectedData.kwik.urls.length} Kwik stream URLs. Processing...`);
            for (const kwikUrl of collectedData.kwik.urls) {
                 try {
                    logCallback(`[Puppeteer] Fetching Kwik URL: ${kwikUrl}`);
                    const response = await fetch(kwikUrl, { headers: { 'Referer': url } });
                    const text = await response.text();
                    
                    const sourceMatch = text.match(/https?:\/\/[^"]+?\.m3u8[^"]*/);
                    if (sourceMatch && sourceMatch[0]) {
                        collectedData.kwik.sources.push({
                            originalUrl: kwikUrl,
                            m3u8: sourceMatch[0],
                        });
                         logCallback(`[Puppeteer] Extracted m3u8 source: ${sourceMatch[0]}`);
                    } else {
                        logCallback(`[Puppeteer] No m3u8 source found in response from ${kwikUrl}`);
                    }
                } catch (e) {
                    logCallback(`[Puppeteer] Error fetching or processing Kwik URL ${kwikUrl}: ${e.message}`, 'error');
                }
            }
        } else {
             logCallback('[Puppeteer] No Kwik stream URLs were intercepted.');
        }

        return collectedData;
    } catch (error) {
        logCallback(`[Puppeteer] An error occurred: ${error.message}`, 'error');
        throw error;
    } finally {
        if (browser) {
            logCallback('[Puppeteer] Closing browser.');
            await browser.close();
        }
    }
}

module.exports = { scrapeAnimePahe };
