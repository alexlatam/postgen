import { createRequire } from 'module';
import { pool } from './db.js';

const require = createRequire(import.meta.url);
const { FlagEmbedding, EmbeddingModel } = require('fastembed');

const CHUNK_WORDS = 600;
const OVERLAP_WORDS = 50;
const BATCH_SIZE = 64;
const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR || './models';

let _model = null;

async function getModel() {
  if (!_model) {
    _model = await FlagEmbedding.init({
      model: EmbeddingModel.MLE5Large,
      cacheDir: MODEL_CACHE_DIR,
    });
  }
  return _model;
}

async function embedPassages(texts) {
  const model = await getModel();
  const prefixed = texts.map(t => `passage: ${t}`);
  const results = [];
  for await (const batch of model.embed(prefixed)) {
    results.push(...batch);
  }
  return results;
}

async function embedQuery(text) {
  const model = await getModel();
  const results = [];
  for await (const batch of model.embed([`query: ${text}`])) {
    results.push(...batch);
  }
  return Array.from(results[0]);
}

function chunkText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + CHUNK_WORDS).join(' ');
    if (chunk.trim()) chunks.push(chunk);
    i += CHUNK_WORDS - OVERLAP_WORDS;
  }
  return chunks;
}

export async function indexBook(bookId, text) {
  const chunks = chunkText(text);
  const client = await pool.connect();
  try {
    await client.query("UPDATE books SET chunk_count = $1, status = 'indexing' WHERE id = $2", [
      chunks.length,
      bookId,
    ]);
    await client.query('BEGIN');

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedPassages(batch);

      // Bulk INSERT — one round-trip per batch instead of N
      const values = [];
      const params = [];
      let p = 1;
      for (let j = 0; j < batch.length; j++) {
        values.push(`($${p}, $${p+1}, $${p+2}, $${p+3})`);
        params.push(bookId, batch[j], i + j, JSON.stringify(Array.from(embeddings[j])));
        p += 4;
      }
      await client.query(
        `INSERT INTO book_chunks (book_id, content, chunk_index, embedding) VALUES ${values.join(',')}`,
        params
      );
      await client.query('UPDATE books SET indexed_count = $1 WHERE id = $2', [i + batch.length, bookId]);
    }

    await client.query('COMMIT');
    await client.query("UPDATE books SET status = 'ready' WHERE id = $1", [bookId]);
    return chunks.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await client.query("UPDATE books SET status = 'error', error = $1 WHERE id = $2", [
      err.message,
      bookId,
    ]);
    throw err;
  } finally {
    client.release();
  }
}

export async function searchQuotes(query, limit = 5, bookId = null) {
  const embedding = await embedQuery(query);
  const params = [JSON.stringify(embedding), limit];
  const bookFilter = bookId ? `AND b.id = $${params.push(bookId)}` : '';
  const result = await pool.query(
    `SELECT bc.content, bc.chunk_index, b.id AS book_id, b.title, b.author,
            ROUND((1 - (bc.embedding <=> $1::vector))::numeric, 3) AS similarity
     FROM book_chunks bc
     JOIN books b ON b.id = bc.book_id
     WHERE b.status = 'ready' ${bookFilter}
     ORDER BY bc.embedding <=> $1::vector
     LIMIT $2`,
    params
  );
  return result.rows;
}

export async function listBooks() {
  const result = await pool.query('SELECT * FROM books ORDER BY created_at DESC');
  return result.rows;
}

export async function getBook(id) {
  const result = await pool.query('SELECT * FROM books WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function createBook(title, author) {
  const result = await pool.query(
    'INSERT INTO books (title, author) VALUES ($1, $2) RETURNING *',
    [title, author]
  );
  return result.rows[0];
}

export async function removeBook(id) {
  await pool.query('DELETE FROM books WHERE id = $1', [id]);
}
