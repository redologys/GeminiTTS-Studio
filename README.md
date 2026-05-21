# TTS Studio

A standalone Text-to-Speech studio powered by OpenRouter and Gemini.

## Features
- Interactive TTS generation with multiple voices.
- Real-time job polling.
- Local storage for generations and metadata (Node.js version).
- Modern, responsive UI.

## Local Development
1. Clone the repository.
2. Run `npm start` to start the Node.js server.
3. Open `http://localhost:44905` in your browser.

## Cloudflare Pages Hosting
This project is designed to be hosted on Cloudflare Pages. 
*Note: The backend logic in `server.js` needs to be adapted to Cloudflare Pages Functions if persistent storage (generations/metadata) is required on the edge.*
