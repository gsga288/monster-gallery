/* -------------- 载入依赖 --------------- */
import express    from 'express';
import fetch      from 'node-fetch';        // v3.x ESM
import formidable from 'formidable';
import fs         from 'fs/promises';
import dotenv     from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());                    // 解析 application/json

/* -------------- 静态资源 ---------------- */
app.use(express.static('public'));          // public 下放 index.html / 图片 / mp4

/* ========= ① Whisper & GPT-4o 聊天 ========= */
app.all('/api/chat', async (req, res) => {
  const contentType = req.headers['content-type'] || '';

  /* --- 1-a Whisper 语音转文字 --- */
  if (contentType.startsWith('multipart/')) {
    const form = formidable();
    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: err.message });

      const fileBuf = await fs.readFile(files.file.filepath);
      const body = new FormData();
      body.append('file', fileBuf, 'voice.webm');
      body.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method : 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body
      });
      const j = await r.json();
      res.status(r.status).json(j);
    });
    return;
  }

  /* --- 1-b GPT-4o 对话 --- */
  const systemPrompt = {
    role   : 'system',
    content: `You are an "Emotional-Resonance Pet" recently hatched...`
  };
  const messages = [
    systemPrompt,
    ...Array.isArray(req.body.messages) ? req.body.messages : []
  ];

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method : 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body   : JSON.stringify({ model: 'gpt-4o', messages })
    });
    const j = await r.json();
    res.status(r.status).json(j);
  } catch (e) {
    console.error('[chat] proxy error', e);
    res.status(500).json({ error: 'chat_proxy_failed', details: e.message });
  }
});

/* ========= ② LOVO 云 TTS ========= */
app.post('/api/tts', async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text_required' });

  try {
    /* 2-a 创建异步 TTS 任务 */
    const job = await fetch('https://api.genny.lovo.ai/api/v1/tts', {
      method : 'POST',
      headers: {
        'X-API-KEY'   : process.env.LOVO_API_KEY,       // ← LOVO key
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        speaker    : process.env.SPEAKER_KAYLEE,        // Kaylee 示例 ID
        text,
        format     : 'mp3',
        sampleRate : 48000
      })
    }).then(r => r.json());

    /* 2-b 轮询最多 15 次直到完成 */
    let audioUrl = null;
    for (let i = 0; i < 15 && !audioUrl; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const info = await fetch(
        `https://api.genny.lovo.ai/api/v1/tts/${job.id}`,
        { headers: { 'X-API-KEY': process.env.LOVO_API_KEY } }
      ).then(r => r.json());
      if (info.status === 'done') audioUrl = info.audioUrl;
    }
    if (!audioUrl) throw new Error('TTS timeout');
    res.json({ audioUrl });

  } catch (e) {
    console.error('[lovo] tts error', e);
    res.status(500).json({ error: 'tts_failed', details: e.message });
  }
});

/* -------------- 启动 ------------------- */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`➡️  http://localhost:${port}`));
