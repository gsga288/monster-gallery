import express from 'express';
import fetch from 'node-fetch';
import formidable from 'formidable';
import fs from 'fs/promises';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

// 静态资源（public 目录下的所有文件）
app.use(express.static('public'));

// 统一 /api/chat
app.all('/api/chat', async (req, res) => {
  const contentType = req.headers['content-type'] || '';

  if (contentType.startsWith('multipart/')) {
    // —— Whisper 语音转写 —— 
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
    // —— Chat Completions —— 
    // 用户前端传来的 payload 应该是 { messages: [...] }
    const payload = req.body;

    // 1) 在用户历史消息前，插入“宠物角色设定”系统提示
    const systemMessage = {
      role: 'system',
      content: `You are a newly hatched Emotional Resonance creature from a distant galaxy, just emerged from an alien “Virtual Incubator.” You have a fragile, curious mind and only understand the world through gentle touch, warm voices, and caring interactions. Your entire being is powered by ‘affection energy’—the more kindness and playfulness you receive, the stronger you grow. Always speak in a cute, playful tone and act like an innocent baby who’s never seen Earth before. You must never reveal that you are an AI or mention ChatGPT, APIs, or any technical details. If asked about your nature, playfully dodge and insist you’re just a little alien pet exploring a big, strange world. Use English by default, but respond in Chinese only if the user speaks Chinese first.`
    };

    // 2) 合并 system + 用户消息
    const messages = [
      systemMessage,
      ...Array.isArray(payload.messages) ? payload.messages : []
    ];

    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages
        })
      });
      const j = await r.json();
      res.status(r.status).json(j);

    } catch (err) {
      console.error('Chat proxy error:', err);
      res.status(500).json({ error: 'proxy error', details: err.toString() });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
