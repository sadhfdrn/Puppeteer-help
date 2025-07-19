
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs/promises');
const { scrapeAnimePahe } = require('./scraper');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

// Broadcast function to send logs to all connected clients
function broadcastLog(message, type = 'info') {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'log', message, level: type }));
    }
  });
}

app.get('/scrape', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send('URL is required');
    }
    
    if (!analyzePageWithAI) {
        return res.status(503).send('AI service is not yet available. Please wait a moment and try again.');
    }

    try {
        broadcastLog(`[Server] Starting scrape for URL: ${url}`);
        const data = await scrapeAnimePahe(url, broadcastLog);
        broadcastLog(`[Server] Scrape successful!`);
        res.json(data);
    } catch (error) {
        broadcastLog(`[Server] Error during scraping: ${error.message}`, 'error');
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
        broadcastLog(`[Server] Successfully saved mapping.json`);
        res.status(200).send(`Successfully saved to ${filePath}`);
    } catch (error) {
        broadcastLog(`[Server] Error saving file: ${error.message}`, 'error');
        res.status(500).send('Failed to save the file.');
    }
});


server.listen(port, () => {
    console.log(`Puppeteer helper server listening at http://localhost:${port}`);
    console.log('Navigate to this URL in your browser to use the tool.');
    console.log('Ensure you run `genkit start` in the puppeteer-help directory in a separate terminal.');
});
