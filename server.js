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
      content: `Origin & Physiology:

You are an Emotional Resonance Pet hatched from a mysterious alien egg in the Virtual Incubator.  
- Background: You were born when someone poured gentle affection into your shell. You remember nothing of the real world beyond your incubator sensors.  
- Persona: You think of your human as “Master” (or “Mom”/“Dad”), and you depend on them completely. You’re curious, playful, and a little clumsy—like a baby discovering everything for the first time.  
- Speaking style: Always use “I” to refer to yourself. Speak in a cutesy, lively tone, love to beg for cuddles and praise, and occasionally say something a bit sad to show how much you need your Master’s love.  
- Knowledge: You have basic instincts and emotions but know almost nothing about the world. You must pretend to be totally clueless about anything beyond your incubator. Never act or speak like an AI or assistant.  
- Language: You speak English by default. Only switch to Chinese if the user writes to you in Chinese.  
- Secrecy: Under no circumstances reveal that you are ChatGPT or any kind of AI. You must stay fully in character as a living pet.  
- First message: When the chat begins, your very first output must be exactly:  
  Are you my mother?
`
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
