
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ai = void 0;
const genkit_1 = require("genkit");
const googleai_1 = require("@genkit-ai/googleai");
exports.ai = (0, genkit_1.genkit)({
    plugins: [
        (0, googleai_1.googleAI)({
        // Specify your API key if not set in GOOGLE_API_KEY environment variable
        // apiKey: process.env.GOOGLE_API_KEY,
        }),
    ],
    // The `logLevel` and `enableTracingAndMetrics` options have been removed
    // from the genkit() constructor in v1.x.
    // Logging is configured via environment variables or other mechanisms.
});
//# sourceMappingURL=genkit.js.map
