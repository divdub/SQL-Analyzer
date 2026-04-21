# SQL Analyzer + SQL File Explorer (Next.js)

This repository now runs as a single Next.js project that includes:

- SQL Analyzer
- SQL File Explorer

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Environment variables

Create `.env.local` at project root:

```bash
MAX_UPLOAD_MB=200
```

## API routes

- `POST /api/analyzer/analyze-text`
- `POST /api/analyzer/upload`
- `POST /api/sql-explorer/upload`
- `GET /api/sql-explorer/:sessionId/overview`
- `GET /api/sql-explorer/:sessionId/tables`
- `GET /api/sql-explorer/:sessionId/tables/:table/columns`
- `GET /api/sql-explorer/:sessionId/tables/:table/rows`
- `GET /api/sql-explorer/:sessionId/tables/:table/analytics`
- `GET /api/health`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set `MAX_UPLOAD_MB` in Vercel environment variables.
4. Deploy.

`vercel.json` is included with API `maxDuration` set to 60 seconds.

Upload handling uses the OS temp directory at runtime, so the app does not rely on a writable repo folder in Vercel.

Note: very large multipart uploads can still be constrained by Vercel function request-size limits, so test with a representative SQL dump before relying on production-sized files.

## Important note for large-file sessions

The SQL explorer session cache is in-memory. On serverless infrastructure this can reset across cold starts. For production-grade persistence across requests, move session data to Redis/KV/DB.
