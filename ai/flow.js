"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzePageWithAI = exports.analyzeDownloadLinksWithAI = void 0;
const genkit_1 = require("./genkit");
const zod_1 = require("zod");

// Enhanced schemas with more detailed validation
const DownloadLinkSchema = zod_1.z.object({
    provider: zod_1.z.string().describe('The name of the download provider (e.g., "WAP", "Yameii", "Mirror", "Direct")'),
    quality: zod_1.z.string().describe('Video quality (e.g., "720p", "1080p", "480p", "4K")'),
    audio: zod_1.z.string().describe('Audio type (e.g., "sub", "dub", "multi", "eng", "jp")'),
    url: zod_1.z.string().url().describe('The direct download URL'),
    fileSize: zod_1.z.string().optional().describe('File size if available (e.g., "1.2GB", "850MB")'),
    format: zod_1.z.string().optional().describe('Video format (e.g., "mp4", "mkv", "avi")')
});

const StreamingSourceSchema = zod_1.z.object({
    type: zod_1.z.enum(['iframe', 'direct', 'embedded', 'ajax']).describe('How the streaming source is embedded'),
    url: zod_1.z.string().optional().describe('The streaming URL if directly available'),
    iframe: zod_1.z.string().optional().describe('Iframe source URL'),
    quality: zod_1.z.string().optional().describe('Stream quality if specified'),
    provider: zod_1.z.string().optional().describe('Streaming provider (e.g., "Kwik", "Mp4upload", "Streamtape")')
});

const ObfuscationTechniqueSchema = zod_1.z.object({
    type: zod_1.z.enum(['base64', 'eval_packed', 'dynamic_script', 'ajax_loading', 'iframe_nested', 'none']),
    description: zod_1.z.string().describe('Detailed description of the obfuscation technique'),
    example: zod_1.z.string().optional().describe('Code example if relevant'),
    deobfuscationSteps: zod_1.z.array(zod_1.z.string()).optional().describe('Steps to deobfuscate')
});

const AnalysisSchema = zod_1.z.object({
    streamingLogic: zod_1.z.string().describe(
        'Comprehensive analysis of how streaming URLs are generated, including technical details about JavaScript execution, API calls, and URL construction'
    ),
    downloadLinks: zod_1.z.array(DownloadLinkSchema).describe('All download links found on the page with detailed metadata'),
    streamingSources: zod_1.z.array(StreamingSourceSchema).describe('Available streaming sources and how they are embedded'),
    obfuscationTechniques: zod_1.z.array(ObfuscationTechniqueSchema).describe('Obfuscation techniques used to hide video URLs'),
    pageStructure: zod_1.z.object({
        hasVideoPlayer: zod_1.z.boolean().describe('Whether the page has a video player'),
        playerType: zod_1.z.string().optional().describe('Type of video player used'),
        hasDownloadSection: zod_1.z.boolean().describe('Whether there is a download section'),
        episodeInfo: zod_1.z.object({
            title: zod_1.z.string().optional(),
            episode: zod_1.z.string().optional(),
            series: zod_1.z.string().optional()
        }).optional()
    }),
    technicalDetails: zod_1.z.object({
        jsFrameworks: zod_1.z.array(zod_1.z.string()).optional().describe('JavaScript frameworks detected'),
        apiEndpoints: zod_1.z.array(zod_1.z.string()).optional().describe('API endpoints that might contain video URLs'),
        cookieRequirements: zod_1.z.boolean().describe('Whether cookies are required for access'),
        referrerPolicy: zod_1.z.string().optional().describe('Referrer policy requirements')
    }),
    extractionStrategy: zod_1.z.string().describe(
        'Recommended strategy for extracting video URLs programmatically, including specific selectors, API calls, or JavaScript execution steps'
    )
});

// Enhanced analysis prompt with more specific instructions
const analysisPrompt = genkit_1.ai.definePrompt({
    name: 'advancedPageAnalysisPrompt',
    model: 'googleai/gemini-2.0-pro',
    input: { schema: zod_1.z.string() },
    output: { schema: AnalysisSchema },
    prompt: `You are an expert web scraping and reverse engineering specialist analyzing an anime episode page. Provide a comprehensive technical analysis of how to extract streaming and download URLs.

    ANALYSIS REQUIREMENTS:

    1. **Streaming Logic Analysis**:
       - Identify all methods used to load/generate video URLs
       - Look for packed JavaScript (eval functions, p,a,c,k patterns)
       - Find AJAX calls that load player data
       - Detect iframe sources and nested players
       - Identify any URL construction patterns

    2. **Download Links Extraction**:
       - Parse all download buttons and links
       - Extract quality, provider, and audio information from button text/attributes
       - Look for hidden or dynamically generated download URLs
       - Identify file formats and sizes if available

    3. **Obfuscation Techniques**:
       - Base64 encoding patterns
       - JavaScript obfuscation (eval, unescape, etc.)
       - Dynamic script loading
       - URL parameter encoding
       - Cookie/session dependencies

    4. **Technical Implementation**:
       - Provide specific CSS selectors for important elements
       - Identify required headers/referrers
       - Note any anti-bot measures
       - Suggest the most reliable extraction method

    5. **Page Structure**:
       - Identify video player type and location
       - Map download section layout
       - Extract episode/series information
       - Note any premium/subscription walls

    Be extremely detailed and technical. Focus on actionable information for programmatic extraction.

    HTML Content to analyze:
    {{{input}}}`,
});

// Specialized prompt for download link analysis
const downloadLinksPrompt = genkit_1.ai.definePrompt({
    name: 'downloadLinksAnalysisPrompt',
    model: 'googleai/gemini-2.0-pro',
    input: { schema: zod_1.z.string() },
    output: { schema: zod_1.z.array(DownloadLinkSchema) },
    prompt: `Extract all download links from this anime episode page. Look for:

    - Download buttons (often containing quality like "720p", "1080p")
    - Provider names (WAP, Mirror, etc.)
    - Audio types (sub, dub, multi)
    - Direct download URLs
    - File sizes and formats

    Focus specifically on the download section and ignore streaming players.

    HTML Content:
    {{{input}}}`,
});

/**
 * Enhanced main analysis function with error handling and retry logic
 */
exports.analyzePageWithAI = (0, genkit_1.ai).defineFlow({
    name: 'analyzePageWithAI',
    inputSchema: zod_1.z.string(),
    outputSchema: AnalysisSchema,
}, (htmlContent) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[AI Flow] Starting comprehensive page analysis...');
    console.log(`[AI Flow] Content length: ${htmlContent.length} characters`);
    
    try {
        // Preprocess HTML content to focus on relevant sections
        const preprocessedContent = preprocessHTML(htmlContent);
        console.log(`[AI Flow] Preprocessed content length: ${preprocessedContent.length} characters`);
        
        // Main analysis with retry logic
        let analysisResult;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[AI Flow] Analysis attempt ${attempt}/${maxRetries}...`);
                const { output } = yield analysisPrompt(preprocessedContent);
                
                if (!output) {
                    throw new Error('AI analysis produced no output');
                }
                
                analysisResult = output;
                console.log(`[AI Flow] Analysis successful on attempt ${attempt}`);
                break;
                
            } catch (error) {
                console.log(`[AI Flow] Attempt ${attempt} failed: ${error.message}`);
                
                if (attempt === maxRetries) {
                    // Return fallback analysis
                    console.log('[AI Flow] All attempts failed, returning fallback analysis');
                    return createFallbackAnalysis(htmlContent, error.message);
                }
                
                // Wait before retry
                yield new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        // Validate and enhance the result
        const enhancedResult = yield enhanceAnalysisResult(analysisResult, htmlContent);
        
        console.log('[AI Flow] Analysis completed successfully');
        return enhancedResult;
        
    } catch (error) {
        console.error('[AI Flow] Critical error during analysis:', error);
        return createFallbackAnalysis(htmlContent, error.message);
    }
}));

/**
 * Specialized function for analyzing download links only
 */
exports.analyzeDownloadLinksWithAI = (0, genkit_1.ai).defineFlow({
    name: 'analyzeDownloadLinksWithAI',
    inputSchema: zod_1.z.string(),
    outputSchema: zod_1.z.array(DownloadLinkSchema),
}, (htmlContent) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[AI Flow] Analyzing download links specifically...');
    
    try {
        const { output } = yield downloadLinksPrompt(htmlContent);
        return output || [];
    } catch (error) {
        console.error('[AI Flow] Download links analysis failed:', error);
        return extractDownloadLinksBasic(htmlContent);
    }
}));

/**
 * Preprocess HTML content to focus on relevant sections
 */
function preprocessHTML(htmlContent) {
    try {
        // Remove unnecessary content to reduce token usage
        let processed = htmlContent
            // Remove comments
            .replace(/<!--[\s\S]*?-->/g, '')
            // Remove style tags
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            // Keep important scripts but truncate very long ones
            .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, content) => {
                if (content.length > 5000) {
                    return `<script>${content.substring(0, 5000)}... [truncated]</script>`;
                }
                return match;
            })
            // Remove excessive whitespace
            .replace(/\s+/g, ' ')
            .trim();
        
        // If still too long, focus on key sections
        if (processed.length > 100000) {
            const keywordSections = [];
            const keywords = ['player', 'video', 'download', 'stream', 'kwik', 'episode', 'quality'];
            
            keywords.forEach(keyword => {
                const regex = new RegExp(`[^>]*${keyword}[^<]*`, 'gi');
                const matches = processed.match(regex) || [];
                keywordSections.push(...matches);
            });
            
            if (keywordSections.length > 0) {
                processed = keywordSections.join('\n') + '\n\n' + processed.substring(0, 50000);
            } else {
                processed = processed.substring(0, 80000);
            }
        }
        
        return processed;
    } catch (error) {
        console.error('[AI Flow] Error preprocessing HTML:', error);
        return htmlContent.substring(0, 80000); // Fallback truncation
    }
}

/**
 * Enhance analysis result with additional processing
 */
function enhanceAnalysisResult(result, htmlContent) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Add basic HTML analysis if AI missed something
            const basicAnalysis = performBasicAnalysis(htmlContent);
            
            // Merge results
            return Object.assign(Object.assign({}, result), { technicalDetails: Object.assign(Object.assign({}, result.technicalDetails), basicAnalysis.technicalDetails), downloadLinks: [...result.downloadLinks, ...basicAnalysis.downloadLinks.filter(link => !result.downloadLinks.some(existing => existing.url === link.url))] });
        } catch (error) {
            console.error('[AI Flow] Error enhancing analysis result:', error);
            return result;
        }
    });
}

/**
 * Create fallback analysis when AI fails
 */
function createFallbackAnalysis(htmlContent, errorMessage) {
    const basicAnalysis = performBasicAnalysis(htmlContent);
    
    return {
        streamingLogic: `AI analysis failed: ${errorMessage}. Basic analysis suggests: ${basicAnalysis.streamingLogic}`,
        downloadLinks: basicAnalysis.downloadLinks,
        streamingSources: basicAnalysis.streamingSources,
        obfuscationTechniques: [{
                type: 'none',
                description: 'Unable to analyze obfuscation techniques due to AI failure'
            }],
        pageStructure: basicAnalysis.pageStructure,
        technicalDetails: basicAnalysis.technicalDetails,
        extractionStrategy: 'Manual analysis required - AI analysis failed. Use basic DOM parsing and network monitoring.'
    };
}

/**
 * Perform basic analysis without AI
 */
function performBasicAnalysis(htmlContent) {
    const downloadLinks = extractDownloadLinksBasic(htmlContent);
    const streamingSources = extractStreamingSourcesBasic(htmlContent);
    const hasVideoPlayer = /player|video/i.test(htmlContent);
    const hasIframes = /<iframe/i.test(htmlContent);
    
    return {
        streamingLogic: hasIframes ? 'Page contains iframes which likely embed video players' : 'No obvious video embedding detected',
        downloadLinks,
        streamingSources,
        pageStructure: {
            hasVideoPlayer,
            hasDownloadSection: downloadLinks.length > 0,
            episodeInfo: extractEpisodeInfoBasic(htmlContent)
        },
        technicalDetails: {
            jsFrameworks: extractJSFrameworks(htmlContent),
            cookieRequirements: /cookie|session/i.test(htmlContent),
            referrerPolicy: extractReferrerPolicy(htmlContent)
        }
    };
}

/**
 * Basic download link extraction
 */
function extractDownloadLinksBasic(htmlContent) {
    const links = [];
    const downloadRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = downloadRegex.exec(htmlContent)) !== null) {
        const url = match[1];
        const text = match[2];
        
        if (/download|mirror|server/i.test(text)) {
            const quality = extractQuality(text) || 'unknown';
            const provider = extractProvider(text) || 'unknown';
            const audio = extractAudio(text) || 'sub';
            
            links.push({
                provider,
                quality,
                audio,
                url: url.startsWith('http') ? url : `https:${url}`
            });
        }
    }
    
    return links;
}

/**
 * Basic streaming sources extraction
 */
function extractStreamingSourcesBasic(htmlContent) {
    const sources = [];
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
    let match;
    
    while ((match = iframeRegex.exec(htmlContent)) !== null) {
        const url = match[1];
        if (/kwik|stream|video|player/i.test(url)) {
            sources.push({
                type: 'iframe',
                iframe: url,
                provider: extractProviderFromURL(url)
            });
        }
    }
    
    return sources;
}

/**
 * Extract quality from text
 */
function extractQuality(text) {
    const qualityMatch = text.match(/(\d+p|4K|HD|SD)/i);
    return qualityMatch ? qualityMatch[1] : null;
}

/**
 * Extract provider from text
 */
function extractProvider(text) {
    const providerMatch = text.match(/(WAP|Mirror|Server|Direct|Yameii|Download)/i);
    return providerMatch ? providerMatch[1] : null;
}

/**
 * Extract audio type from text
 */
function extractAudio(text) {
    if (/dub|english/i.test(text)) return 'dub';
    if (/sub|subtitle/i.test(text)) return 'sub';
    return 'sub'; // default
}

/**
 * Extract provider from URL
 */
function extractProviderFromURL(url) {
    if (/kwik/i.test(url)) return 'Kwik';
    if (/mp4upload/i.test(url)) return 'Mp4upload';
    if (/streamtape/i.test(url)) return 'Streamtape';
    return 'Unknown';
}

/**
 * Extract episode information
 */
function extractEpisodeInfoBasic(htmlContent) {
    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : undefined;
    
    return {
        title,
        episode: extractEpisodeNumber(title),
        series: extractSeriesName(title)
    };
}

/**
 * Extract episode number from title
 */
function extractEpisodeNumber(title) {
    if (!title) return undefined;
    const episodeMatch = title.match(/episode\s*(\d+)|ep\s*(\d+)/i);
    return episodeMatch ? (episodeMatch[1] || episodeMatch[2]) : undefined;
}

/**
 * Extract series name from title
 */
function extractSeriesName(title) {
    if (!title) return undefined;
    return title.split(/episode|ep|\-/i)[0]?.trim();
}

/**
 * Extract JavaScript frameworks
 */
function extractJSFrameworks(htmlContent) {
    const frameworks = [];
    if (/jquery/i.test(htmlContent)) frameworks.push('jQuery');
    if (/react/i.test(htmlContent)) frameworks.push('React');
    if (/vue/i.test(htmlContent)) frameworks.push('Vue');
    if (/angular/i.test(htmlContent)) frameworks.push('Angular');
    return frameworks;
}

/**
 * Extract referrer policy
 */
function extractReferrerPolicy(htmlContent) {
    const policyMatch = htmlContent.match(/referrerpolicy=["']([^"']+)["']/i);
    return policyMatch ? policyMatch[1] : undefined;
}

// Export utility functions for testing
module.exports = {
    analyzePageWithAI: exports.analyzePageWithAI,
    analyzeDownloadLinksWithAI: exports.analyzeDownloadLinksWithAI,
    preprocessHTML,
    performBasicAnalysis,
    extractDownloadLinksBasic
};
