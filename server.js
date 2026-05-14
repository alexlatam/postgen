import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { publishToLinkedIn } from './dist/lib/linkedin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

const { LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID } = process.env;

if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_PERSON_ID) {
  console.error('Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_ID in .env');
  process.exit(1);
}

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));

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
  console.log(`✅ Server on http://localhost:${PORT}`);
});
