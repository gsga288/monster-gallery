// server.js
import express from 'express';
import fetch from 'node-fetch';
import formidable from 'formidable';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

// 静态资源（index.html, media/*）
app.use(express.static('.'));


// 统一 /api/chat
app.all('/api/chat', async (req, res) => {
  // multipart → Whisper；否则 → Chat
  const contentType = req.headers['content-type'] || '';

  if (contentType.startsWith('multipart/')) {
    // Whisper 转写
    const form = formidable();
    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: err.message });
      const file = files.file;
      const buffer = await fs.readFile(file.filepath);
      const body = new FormData();
      body.append('file', buffer, 'voice.webm');
      body.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body
      });
      const j = await r.json();
      res.status(r.status).json(j);
    });
  } else {
    // Chat completions
    // Expect body: { messages: [...] }
    const payload = req.body;
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          ...payload
        })
      });
      const j = await r.json();
      res.status(r.status).json(j);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'proxy error', details: err.toString() });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log(`Server listening on http://localhost:${port}`));
