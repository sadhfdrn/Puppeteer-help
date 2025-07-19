const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { scrapeAnimePahe } = require('./scraper');

const app = express();
const port = 3001;

// This is a dynamic import because Genkit flows are ESM
// and this server file is CommonJS.
let analyzePageWithAI;
import('./ai/flow.js').then(module => {
    analyzePageWithAI = module.analyzePageWithAI;
    console.log('[Server] AI module loaded successfully.');
}).catch(err => {
    console.error('[Server] Failed to load AI module:', err);
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/scrape', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }
    
    if (!analyzePageWithAI) {
        return res.status(503).send('AI service is not yet available. Please wait a moment and try again.');
    }

    try {
        console.log(`[Server] Starting scrape for URL: ${url}`);
        const data = await scrapeAnimePahe(url);
        console.log(`[Server] Scrape successful for URL: ${url}`);
        res.json(data);
    } catch (error) {
        console.error(`[Server] Error during scraping: ${error.message}`);
        res.status(500).send(`Scraping failed: ${error.message}`);
    }
});

app.post('/save', async (req, res) => {
    try {
        const content = req.body.data;
        if (!content) {
            return res.status(400).send('No data provided to save.');
        }
        const filePath = path.join(__dirname, 'mapping.json');
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`[Server] Successfully saved mapping.json`);
        res.status(200).send(`Successfully saved to ${filePath}`);
    } catch (error) {
        console.error(`[Server] Error saving file: ${error.message}`);
        res.status(500).send('Failed to save the file.');
    }
});


app.listen(port, () => {
    console.log(`Puppeteer helper server listening at http://localhost:${port}`);
    console.log('Navigate to this URL in your browser to use the tool.');
    console.log('Ensure you run `genkit start` in the puppeteer-help directory in a separate terminal.');
});
