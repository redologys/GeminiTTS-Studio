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

This project is optimized for **Cloudflare Pages**.

### Option 1: Deploy via GitHub (Recommended)
1. Push this repo to GitHub.
2. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Use these settings:
   - **Framework preset**: `None`
   - **Build command**: (Leave empty)
   - **Build output directory**: `.` (the root directory)
4. Click **Save and Deploy**. Cloudflare will automatically detect the `functions/` folder.

### Option 2: Deploy via Wrangler CLI
If you prefer to deploy from your terminal:
```bash
npx wrangler pages deploy .
```
*(Note: Do **not** use `npx wrangler deploy` as that is for Cloudflare Workers.)*

