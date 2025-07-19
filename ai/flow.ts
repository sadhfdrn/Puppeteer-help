// IMPORTANT: This file needs to be compiled to JS before it can be used by server.js
// You can do this by running `npx tsc` in the `puppeteer-help` directory.
'use server';
import { ai } from './genkit';
import { z } from 'zod';

const DownloadLinkSchema = z.object({
  provider: z.string().describe('The name of the download provider, e.g., "WAP" or "Yameii"'),
  quality: z.string().describe('The quality of the download, e.g., "720p" or "1080p"'),
  audio: z.string().describe('The audio language, e.g., "sub" or "dub"'),
  url: z.string().url().describe('The direct download URL.'),
});

const AnalysisSchema = z.object({
  streamingLogic: z
    .string()
    .describe(
      'A summary of how the streaming URLs are generated or found on the page. Mention any obfuscation techniques like base64 encoding, eval(), or dynamic script loading.'
    ),
  downloadLinks: z
    .array(DownloadLinkSchema)
    .describe('An array of all available download links found on the page.'),
});

const analysisPrompt = ai.definePrompt({
  name: 'pageAnalysisPrompt',
  input: { schema: z.string() },
  output: { schema: AnalysisSchema },
  prompt: `You are an expert web scraping assistant. Analyze the provided HTML content of an anime episode page. Your goal is to determine how to extract direct streaming and download links.

    Based on the HTML, provide the following:
    1.  **Streaming Logic**: Explain the steps to find the primary video stream URL. Look for iframes, packed/obfuscated JavaScript (like 'eval(function(p,a,c,k,e,d){...})'), or dynamic script tags that load the video player. Describe the process to deobfuscate if necessary.
    2.  **Download Links**: Extract all direct download links. Parse the button text to determine the quality, provider, and audio type (sub/dub) for each link.

    HTML Content:
    {{{input}}}`,
});

export const analyzePageWithAI = ai.defineFlow(
  {
    name: 'analyzePageWithAI',
    inputSchema: z.string(),
    outputSchema: AnalysisSchema,
  },
  async (htmlContent) => {
    console.log('[AI Flow] Starting page analysis...');
    const { output } = await analysisPrompt(htmlContent);
    if (!output) {
      throw new Error('AI analysis failed to produce an output.');
    }
    console.log('[AI Flow] Analysis complete.');
    return output;
  }
);
