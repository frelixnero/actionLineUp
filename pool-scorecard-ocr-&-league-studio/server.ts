import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processScorecardOcr, fetchImageAsBase64 } from './server/ocr.js';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Parse JSON bodies up to 50MB (to allow base64 scorecard uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Healthcheck & environment status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
    time: new Date().toISOString()
  });
});

// Proxy image endpoint to bypass CORS and prevent tainted canvas on the frontend
app.post('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }
    const { base64, mimeType } = await fetchImageAsBase64(url);
    res.json({
      ok: true,
      dataUrl: `data:${mimeType};base64,${base64}`,
      mimeType
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: `Failed to proxy image: ${err.message || err}`
    });
  }
});

// Main scorecard OCR analysis endpoint
app.post('/api/ocr/analyze', async (req, res) => {
  try {
    const { imageUrl, scanPath, imageBase64, mimeType, preferredModel } = req.body;

    const result = await processScorecardOcr({
      imageUrl,
      scanPath,
      imageBase64,
      mimeType,
      preferredModel
    });

    res.json(result);
  } catch (err: any) {
    console.error('OCR processing unexpected error:', err);
    res.status(500).json({
      ok: false,
      error: `Unexpected server OCR error: ${err.message || err}`,
      diagnostics: {
        reasonForPreviousAppFailure: 'Server crashed on unhandled promise or formatting error.'
      }
    });
  }
});

// Diagnostics test endpoint: tests a specific model with a simple prompt
app.post('/api/diagnose/test-model', async (req, res) => {
  try {
    const { model = 'gemini-3.1-flash-lite' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(400).json({ ok: false, error: 'GEMINI_API_KEY is not configured in environment.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const start = Date.now();
    const result = await ai.models.generateContent({
      model,
      contents: 'Ping test. Reply with: {"status": "ok"}',
      config: { responseMimeType: 'application/json' }
    });

    res.json({
      ok: true,
      model,
      latencyMs: Date.now() - start,
      reply: result.text
    });
  } catch (err: any) {
    res.json({
      ok: false,
      model: req.body?.model,
      error: err.message || String(err),
      status: err?.status || (err?.message?.includes('503') ? 503 : 500)
    });
  }
});

// Setup Vite in development or static serving in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pool Scorecard OCR Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
