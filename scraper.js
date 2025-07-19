
const puppeteer = require('puppeteer-core');
const { analyzePageWithAI } = require('./ai/flow.js');

async function scrapeAnimePahe(url) {
    let browser;
    console.log('[Puppeteer] Launching browser...');
    try {
        // When running inside a Docker container, Puppeteer can use the pre-installed
        // Chromium instance if the PUPPETEER_EXECUTABLE_PATH environment variable is set.
        // The browserless/chrome image handles this for us.
        browser = await puppeteer.launch({
            headless: true,
            // The 'executablePath' is often unnecessary if the ENV VAR is set,
            // but we can add it for explicit clarity.
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
                collectedData.kwik.urls.push(reqUrl);
                collectedData.referrer = request.headers().referer;
            }
        });
        
        console.log(`[Puppeteer] Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('[Puppeteer] Page loaded. Getting content...');
        
        const pageContent = await page.content();

        console.log('[Puppeteer] Sending page content to AI for analysis...');
        const aiAnalysis = await analyzePageWithAI(pageContent);
        collectedData.analysis = aiAnalysis;
        console.log('[AI Analysis] Received insights:', aiAnalysis);

        collectedData.downloadLinks = aiAnalysis.downloadLinks || [];

        if (collectedData.kwik.urls.length > 0) {
            console.log(`[Puppeteer] Found ${collectedData.kwik.urls.length} Kwik URLs. Processing...`);
            for (const kwikUrl of collectedData.kwik.urls) {
                 try {
                    console.log(`[Puppeteer] Fetching Kwik URL: ${kwikUrl}`);
                    const response = await fetch(kwikUrl, { headers: { 'Referer': url } });
                    const text = await response.text();
                    
                    const sourceMatch = text.match(/https?:\/\/[^"]+?\.m3u8[^"]*/);
                    if (sourceMatch && sourceMatch[0]) {
                        collectedData.kwik.sources.push({
                            originalUrl: kwikUrl,
                            m3u8: sourceMatch[0],
                        });
                         console.log(`[Puppeteer] Extracted m3u8 source: ${sourceMatch[0]}`);
                    } else {
                        console.log(`[Puppeteer] No m3u8 source found in response from ${kwikUrl}`);
                    }
                } catch (e) {
                    console.error(`[Puppeteer] Error fetching or processing Kwik URL ${kwikUrl}:`, e.message);
                }
            }
        } else {
             console.log('[Puppeteer] No Kwik URLs were intercepted.');
        }

        return collectedData;
    } catch (error) {
        console.error(`[Puppeteer] An error occurred: ${error.message}`);
        throw error;
    } finally {
        if (browser) {
            console.log('[Puppeteer] Closing browser.');
            await browser.close();
        }
    }
}

module.exports = { scrapeAnimePahe };
