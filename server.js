import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { publishToLinkedIn } from './dist/lib/linkedin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

const { LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID, GEMINI_API_KEY } = process.env;

if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_PERSON_ID) {
  console.error('❌ Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_ID in .env');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const audienceMatch = raw.match(/^Audience:\s*(.+)/m);
    const audience = audienceMatch ? audienceMatch[1].trim() : 'General';
    const post = raw.replace(/^Audience:\s*.+\n?/m, '').trim();

    return res.json({ post, audience });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/publish', async (req, res) => {
  const { text } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ error: 'Post text is required' });
  }

  try {
    const result = await publishToLinkedIn(text, LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID);

    if (result.ok) {
      return res.json({ success: true });
    }
    return res.status(500).json({ error: result.error });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ PostGen server running`);
  console.log(`   App  →  http://localhost:${PORT}/linkedin-poster.html`);
  console.log(`   API  →  http://localhost:${PORT}/publish\n`);
});
