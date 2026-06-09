import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { publishToLinkedIn } from './dist/lib/linkedin.js';
import { initDb } from './db.js';
import { indexBook, searchQuotes, listBooks, getBook, createBook, removeBook } from './rag.js';

const require = createRequire(import.meta.url);
const multer = require('multer');
const { PDFParse } = require('pdf-parse');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

const { LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_ID, GEMINI_API_KEY, OPENROUTER_API_KEY, DATABASE_URL } = process.env;

if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_PERSON_ID) {
  console.error('❌ Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_ID in .env');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

if (!OPENROUTER_API_KEY) {
  console.warn('⚠️  OPENROUTER_API_KEY not set — /generate-grok will not work');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

if (DATABASE_URL) {
  initDb()
    .then(() => console.log('✅ Database ready'))
    .catch(err => console.error('❌ DB init failed:', err.message));
} else {
  console.warn('⚠️  DATABASE_URL not set — /books routes will not work');
}

function parseGeneratedPost(raw) {
  const audienceMatch = raw.match(/^Audience:\s*(.+)/m);
  const audience = audienceMatch ? audienceMatch[1].trim() : 'General';
  const post = raw.replace(/^Audience:\s*.+\n?/m, '').trim();
  return { post, audience };
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
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
    return res.json(parseGeneratedPost(raw));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/generate-grok', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4.3',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenRouter API error' });
    }

    const raw = data.choices?.[0]?.message?.content || '';
    return res.json(parseGeneratedPost(raw));
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

// ── RAG routes ──

app.get('/books', async (req, res) => {
  try {
    res.json(await listBooks());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/books/:id/status', async (req, res) => {
  try {
    const book = await getBook(req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json(book);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/books/upload', upload.single('file'), async (req, res) => {
  const { title, author } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!req.file) return res.status(400).json({ error: 'File is required' });
  if (!DATABASE_URL) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  try {
    let text;
    const mime = req.file.mimetype;
    if (mime === 'application/pdf' || req.file.originalname.endsWith('.pdf')) {
      const parser = new PDFParse({ data: req.file.buffer });
      const parsed = await parser.getText();
      text = parsed.text;
    } else {
      text = req.file.buffer.toString('utf-8');
    }

    if (!text.trim()) return res.status(400).json({ error: 'Could not extract text from file' });

    const book = await createBook(title.trim(), author?.trim() || '');
    res.json({ book });

    indexBook(book.id, text).catch(err =>
      console.error(`Index error "${title}":`, err.message)
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/books/query', async (req, res) => {
  const { query, limit = 5, book_id = null } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'Query is required' });
  if (!DATABASE_URL) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  try {
    const chunks = await searchQuotes(query, Number(limit), book_id);
    if (!chunks.length) return res.json({ quote: null, sources: [] });

    const context = chunks
      .map((c, i) => `[Fragmento ${i + 1} — "${c.title}"${c.author ? ` de ${c.author}` : ''}]\n${c.content}`)
      .join('\n\n---\n\n');

    const extractionPrompt = `Eres un extractor de citas de libros. Tu única tarea es encontrar y devolver una cita exacta y breve del texto.

El usuario busca: "${query}"

Fragmentos relevantes del libro:
${context}

Instrucciones:
- Encuentra el pasaje que mejor responde a la búsqueda
- Copia el texto EXACTAMENTE como aparece en el fragmento (sin parafrasear)
- Máximo 3 oraciones. Si el consejo es una sola oración, devuelve solo esa
- No añadas explicaciones ni contexto

Responde ÚNICAMENTE en este formato:
CITA: [texto exacto del libro]
LIBRO: [título]
AUTOR: [autor o vacío si no hay]
FRAGMENTO: [número del fragmento de donde viene]`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: extractionPrompt }] }] }),
      }
    );

    const geminiData = await geminiRes.json();
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const quote = (raw.match(/CITA:\s*(.+?)(?=\nLIBRO:|$)/s)?.[1] || '').trim();
    const book  = (raw.match(/LIBRO:\s*(.+)/)?.[1] || chunks[0].title).trim();
    const author = (raw.match(/AUTOR:\s*(.+)/)?.[1] || chunks[0].author || '').trim();
    const fragIdx = parseInt(raw.match(/FRAGMENTO:\s*(\d+)/)?.[1] || '1') - 1;
    const similarity = chunks[Math.max(0, Math.min(fragIdx, chunks.length - 1))]?.similarity;

    res.json({ quote, book, author, similarity, sources: chunks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/books/:id', async (req, res) => {
  try {
    await removeBook(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ PostGen server running`);
  console.log(`   PostGen  →  http://localhost:${PORT}/linkedin-poster.html`);
  console.log(`   BookRAG  →  http://localhost:${PORT}/book-rag.html`);
  console.log(`   API      →  http://localhost:${PORT}/publish\n`);
});
