'use strict';

const { genkit } = require('genkit');
const { googleAI } = require('@genkit-ai/googleai');

const ai = genkit({
  plugins: [
    googleAI({
      models: [
        {
          name: 'gemini-pro',
          model: 'models/gemini-1.5-pro-latest', // or explicitly: 'models/gemini-1.5-pro-002'
        }
      ],
      // Optional: apiKey: process.env.GOOGLE_API_KEY,
    }),
  ],
});

module.exports = { ai };
