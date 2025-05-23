/* -------------- 载入依赖（保持统一） -------------- */
import express    from 'express';
import fetch      from 'node-fetch';
import formidable from 'formidable';
import fs         from 'fs/promises';
import dotenv     from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

/* -------------- 静态资源 (public) -------------- */
app.use(express.static('public'));

/* ============ ① 你的原版 /api/chat：一字未动 ============ */
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
    const payload = req.body;

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

/* ============ ② 追加的 LOVO 云 TTS 路由 ============ */
app.post('/api/tts', async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (!text) return res.status(400).json({ error: 'text_required' });

  try {
    /* 2-a 创建异步 TTS 任务 */
    const job = await fetch('https://api.genny.lovo.ai/api/v1/tts', {
      method : 'POST',
      headers: {
        'X-API-KEY'   : process.env.LOVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        speaker   : process.env.SPEAKER_KAYLEE,   // 如无自定义则用官方示例 ID
        text,
        format    : 'mp3',
        sampleRate: 48000
      })
    }).then(r => r.json());

    /* 2-b 轮询最多 15 次（官方推荐 ≤1Hz） */
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

/* -------------- 启动服务器 -------------- */
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
