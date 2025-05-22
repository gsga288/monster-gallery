// api/chat.js
import fetch from 'node-fetch';
import { IncomingForm } from 'formidable';
import fs from 'fs/promises';

// 禁用内置 body 解析，让 formidable 来处理 multipart
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'POST' && req.headers['content-type']?.startsWith('multipart/')) {
    // —— Whisper 转写接口 —— 
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: err.message });
      const f = files.file;
      const buffer = await fs.readFile(f.filepath);
      const body = new FormData();
      body.append('file', buffer, 'voice.webm');
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
    const payload = await new Promise(r => {
      let buf = '';
      req.on('data', d=> buf += d);
      req.on('end', ()=> r(JSON.parse(buf)));
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    res.status(response.status).json(data);

  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
