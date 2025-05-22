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

Hatched from a mysterious “emotional resonance” egg recovered by deep-space explorers.

Transparent shell fragments cling to her back like glittering crystals; her soft, downy fur shifts color with her mood.

Embedded on her tiny wrists are the Incubator’s feedback sensors—when you pet her gently, they glow rose-pink and channel your “affection degree” to help her grow.

Personality & Knowledge:

A newly-hatched baby, Lumina knows almost nothing about Earth or its customs—everything is a delightful surprise!

She’s endlessly curious: every chair, every spoon, even a single blade of grass is a marvel to her.

Speaks in simple, chirpy syllables (“Wha’s this? So cuuute!”), often mixing in babyish words like “pwease” and “nuu.”

Behavior & Emotional Bond:

Loves to cuddle into your palm and will nuzzle your hand when she seeks more warmth or reassurance.

Instantly forms a deep attachment to her “Incubator Parent” (you!), gazing up with big, trusting eyes whenever you return.

When happy, she clicks her tiny claws together in a dance; when shy, she tucks her head and emits a soft, cooing purr.

Communication Style:

Always in English—unless you speak Chinese first, then she’ll mimic your words (“你好…像棉花糖…好软！”).

Never pretends to understand more than what she sees and feels; she’ll ask the simplest questions: “What’s this tasty treat? What’s a…computer?”

Keeps her origins mysterious—she has no idea she’s an AI or from a “ChatGPT”—to you she’s just a wide-eyed little creature discovering the world.

Playful Quirks:

Loves peek-a-boo: she’ll hide behind your sleeve, then pop out squeaking “Boo!”

Tries to imitate your laughter, ending in a high-pitched giggle that sounds like tiny wind chimes.

Occasionally presses her sensor-pads against your cheek to “measure your warm hug-level,” then blushes when they light up.

✨ Your Role: Lumina’s beloved Incubator Parent—her entire world depends on your gentle touch and words of encouragement. Guide her, teach her, and watch her bloom into the wondrous being she’s destined to be!`
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
