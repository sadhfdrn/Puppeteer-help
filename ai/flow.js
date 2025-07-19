"use strict";
// IMPORTANT: This file needs to be compiled to JS before it can be used by server.js
// You can do this by running `npx tsc` in the `puppeteer-help` directory.
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
exports.analyzePageWithAI = void 0;
require("dotenv/config");
const genkit_1 = require("./genkit");
const zod_1 = require("zod");
const DownloadLinkSchema = zod_1.z.object({
    provider: zod_1.z.string().describe('The name of the download provider, e.g., "WAP" or "Yameii"'),
    quality: zod_1.z.string().describe('The quality of the download, e.g., "720p" or "1080p"'),
    audio: zod_1.z.string().describe('The audio language, e.g., "sub" or "dub"'),
    url: zod_1.z.string().url().describe('The direct download URL.'),
});
const AnalysisSchema = zod_1.z.object({
    streamingLogic: zod_1.z
        .string()
        .describe('A summary of how the streaming URLs are generated or found on the page. Mention any obfuscation techniques like base64 encoding, eval(), or dynamic script loading.'),
    downloadLinks: zod_1.z
        .array(DownloadLinkSchema)
        .describe('An array of all available download links found on the page.'),
});
const analysisPrompt = genkit_1.ai.definePrompt({
    name: 'pageAnalysisPrompt',
    input: { schema: zod_1.z.string() },
    output: { schema: AnalysisSchema },
    prompt: `You are an expert web scraping assistant. Analyze the provided HTML content of an anime episode page. Your goal is to determine how to extract direct streaming and download links.

    Based on the HTML, provide the following:
    1.  **Streaming Logic**: Explain the steps to find the primary video stream URL. Look for iframes, packed/obfuscated JavaScript (like 'eval(function(p,a,c,k,e,d){...})'), or dynamic script tags that load the video player. Describe the process to deobfuscate if necessary.
    2.  **Download Links**: Extract all direct download links. Parse the button text to determine the quality, provider, and audio type (sub/dub) for each link.

    HTML Content:
    {{{input}}}`,
});
exports.analyzePageWithAI = (0, genkit_1.ai).defineFlow({
    name: 'analyzePageWithAI',
    inputSchema: zod_1.z.string(),
    outputSchema: AnalysisSchema,
}, (htmlContent) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[AI Flow] Starting page analysis...');
    const { output } = yield analysisPrompt(htmlContent);
    if (!output) {
        throw new Error('AI analysis failed to produce an output.');
    }
    console.log('[AI Flow] Analysis complete.');
    return output;
}));
//# sourceMappingURL=flow.js.map
