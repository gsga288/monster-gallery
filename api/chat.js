// api/chat.js
import fetch from 'node-fetch';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

// Next.js 风格：禁用内置 bodyParser，让 formidable 处理 multipart
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/')) {
    // —— Whisper 转写 —— 
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: err.message });
      const f = files.file;
      const buf = await fs.readFile(f.filepath);
      const body = new FormData();
      body.append('file', buf, 'voice.webm');
      body.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body
      });
      const j = await r.json();
      res.status(r.status).json(j);
    });

  } else if (req.method === 'POST') {
    // —— Chat Completions —— 
    let payload = '';
    for await (const chunk of req) payload += chunk;
    payload = JSON.parse(payload);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    res.status(r.status).json(j);

  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
