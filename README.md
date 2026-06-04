# Future Plan: PDF + RAG

- Use Supabase (Postgres + pgvector) for document store.
- Create `documents` table (content, embedding, title, source, created_at).
- Build `/api/upload-pdf` for uploading & embedding PDFs.
- Build `/api/rag-chat` for retrieval-augmented chat.