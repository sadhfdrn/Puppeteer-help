const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs/promises');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { scrapeAnimePahe } = require('./scraper');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    // Basic origin verification
    return info.origin === `http://localhost:${port}` || process.env.NODE_ENV === 'development';
  }
});

const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", `ws://localhost:${port}`]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  methods: ['GET', 'POST'],
  credentials: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/scrape', limiter);

// Stricter rate limit for scraping endpoint
const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit to 10 scrape requests per minute
  message: 'Too many scraping requests, please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/scrape', scrapeLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Track active connections
let activeConnections = new Set();

// Dynamic import for Genkit flows (ESM compatibility)
let analyzePageWithAI;
let isAIModuleLoaded = false;

const loadAIModule = async () => {
  try {
    const module = await import('./ai/flow.js');
    analyzePageWithAI = module.analyzePageWithAI;
    isAIModuleLoaded = true;
    console.log('[Server] AI module loaded successfully.');
    broadcastLog('[Server] AI analysis service is now available.', 'info');
  } catch (err) {
    console.error('[Server] Failed to load AI module:', err);
    broadcastLog('[Server] Failed to initialize AI service. Please check configuration.', 'error');
    
    // Retry loading after 10 seconds
    setTimeout(loadAIModule, 10000);
  }
};

// Initialize AI module
loadAIModule();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    aiServiceAvailable: isAIModuleLoaded,
    uptime: process.uptime(),
    connections: activeConnections.size,
    timestamp: new Date().toISOString()
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(7);
  activeConnections.add(ws);
  
  console.log(`[WebSocket] New connection established: ${clientId}`);
  ws.send(JSON.stringify({ 
    type: 'connection', 
    message: 'Connected to scraper service',
    clientId: clientId
  }));

  ws.on('close', () => {
    activeConnections.delete(ws);
    console.log(`[WebSocket] Connection closed: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Connection error for ${clientId}:`, error);
    activeConnections.delete(ws);
  });

  // Send periodic heartbeat
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on('pong', () => {
    // Connection is alive
  });
});

// Broadcast function with connection health check
function broadcastLog(message, type = 'info', data = null) {
  const logMessage = {
    type: 'log',
    message,
    level: type,
    timestamp: new Date().toISOString(),
    ...(data && { data })
  };

  // Clean up dead connections
  const deadConnections = [];
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(logMessage));
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error);
        deadConnections.push(client);
      }
    } else {
      deadConnections.push(client);
    }
  });

  // Remove dead connections
  deadConnections.forEach(client => {
    activeConnections.delete(client);
  });

  // Also log to console
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Enhanced scraping endpoint with better error handling
app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  
  // Input validation
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // URL validation
  try {
    const urlObj = new URL(url);
    // Add domain whitelist for security
    const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || ['animepahe.ru', 'animepahe.com'];
    
    if (process.env.NODE_ENV === 'production' && !allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
      return res.status(403).json({ error: 'Domain not allowed for scraping' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Check if AI service is available
  if (!isAIModuleLoaded) {
    return res.status(503).json({ 
      error: 'AI analysis service is not available',
      message: 'Please wait for the service to initialize and try again.'
    });
  }

  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  try {
    broadcastLog(`[Server] Starting scrape request ${requestId} for URL: ${url}`, 'info');
    
    const data = await scrapeAnimePahe(url, (message, level = 'info') => {
      broadcastLog(`[${requestId}] ${message}`, level);
    });
    
    const duration = Date.now() - startTime;
    broadcastLog(`[Server] Scrape ${requestId} completed successfully in ${duration}ms`, 'info');
    
    // Add metadata to response
    const response = {
      ...data,
      metadata: {
        requestId,
        duration,
        timestamp: new Date().toISOString(),
        url: url
      }
    };
    
    res.json(response);
  } catch (error) {
    const duration = Date.now() - startTime;
    broadcastLog(`[Server] Scrape ${requestId} failed after ${duration}ms: ${error.message}`, 'error');
    
    res.status(500).json({ 
      error: 'Scraping failed',
      message: error.message,
      requestId,
      duration
    });
  }
});

// Enhanced save endpoint with validation
app.post('/save', async (req, res) => {
  try {
    const { data: content, filename } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'No data provided to save' });
    }

    // Validate JSON format
    try {
      JSON.parse(content);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }

    const sanitizedFilename = (filename || 'mapping').replace(/[^a-zA-Z0-9_-]/g, '') + '.json';
    const filePath = path.join(__dirname, 'data', sanitizedFilename);
    
    // Ensure data directory exists
    await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    
    // Create backup if file exists
    try {
      await fs.access(filePath);
      const backupPath = filePath.replace('.json', `_backup_${Date.now()}.json`);
      await fs.copyFile(filePath, backupPath);
      broadcastLog(`[Server] Created backup: ${path.basename(backupPath)}`, 'info');
    } catch (error) {
      // File doesn't exist, no backup needed
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    broadcastLog(`[Server] Successfully saved ${sanitizedFilename}`, 'info');
    
    res.json({ 
      success: true,
      message: `Successfully saved to ${sanitizedFilename}`,
      path: filePath,
      size: Buffer.byteLength(content, 'utf8')
    });
  } catch (error) {
    broadcastLog(`[Server] Error saving file: ${error.message}`, 'error');
    res.status(500).json({ 
      error: 'Failed to save the file',
      message: error.message 
    });
  }
});

// List saved files endpoint
app.get('/files', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    try {
      const files = await fs.readdir(dataDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      const fileDetails = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = path.join(dataDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime
          };
        })
      );
      
      res.json({ files: fileDetails });
    } catch (error) {
      // Data directory doesn't exist
      res.json({ files: [] });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down gracefully...');
  
  // Close all WebSocket connections
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'shutdown',
        message: 'Server is shutting down'
      }));
      client.close();
    }
  });
  
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT, shutting down gracefully...');
  process.emit('SIGTERM');
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught Exception:', error);
  broadcastLog(`[Server] Critical error: ${error.message}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
  broadcastLog(`[Server] Unhandled promise rejection: ${reason}`, 'error');
});

// Start server
server.listen(port, () => {
  console.log(`[Server] AI-Powered Scraper Helper listening at http://localhost:${port}`);
  console.log('[Server] Navigate to this URL in your browser to use the tool.');
  console.log('[Server] Ensure you run `genkit start` in a separate terminal.');
  console.log('[Server] Press Ctrl+C to stop the server.');
});

module.exports = { app, server, broadcastLog };
