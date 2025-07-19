import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [
    googleAI({
      // Specify your API key if not set in GOOGLE_API_KEY environment variable
      // apiKey: process.env.GOOGLE_API_KEY,
    }),
  ],
  // The `logLevel` and `enableTracingAndMetrics` options have been removed
  // from the genkit() constructor in v1.x.
  // Logging is configured via environment variables or other mechanisms.
});
