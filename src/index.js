import express from 'express';
import { createRouter, errorMiddleware } from './routes.js';
import { getSquad, getPlayer } from './lib/scraper.js';
import * as parsers from './lib/parsers.js';
import { fetchText } from './lib/fetcher.js';
import { docsEnabled } from './lib/docs.js';

const app = express();

const docs = docsEnabled();
const scraper = { getSquad, getPlayer };
app.use(createRouter({ scraper, parsers, fetchText, docs }));
app.use(errorMiddleware);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`af-api listening on http://localhost:${port}`);
  console.log(docs ? `docs at http://localhost:${port}/docs` : 'docs disabled (DOCS_ENABLED=false)');
});
