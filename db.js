import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    await client.query(`
      CREATE TABLE IF NOT EXISTS books (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        author TEXT DEFAULT '',
        chunk_count INT DEFAULT 0,
        indexed_count INT DEFAULT 0,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS book_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        book_id UUID REFERENCES books(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        chunk_index INT NOT NULL,
        embedding vector(1024),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS book_chunks_embedding_idx
      ON book_chunks USING hnsw (embedding vector_cosine_ops)
    `);
  } finally {
    client.release();
  }
}
