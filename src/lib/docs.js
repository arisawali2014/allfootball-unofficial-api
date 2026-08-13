// Public API documentation, mounted only when enabled (see DOCS_ENABLED).
//
// Everything is served from disk — the Swagger UI assets come from the
// swagger-ui-dist package, not a CDN — so the docs work offline and behind a
// firewall. The spec's first server entry is the relative URL "/", so "Try it
// out" targets whatever host the docs are being served from.

import express from 'express';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const SPEC_FILE = join(PROJECT_ROOT, 'openapi.yaml');
export const REFERENCE_FILE = join(PROJECT_ROOT, 'API.md');

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>af-api reference</title>
    <link rel="stylesheet" href="/docs/index.css" />
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
    <link rel="icon" href="/docs/favicon-32x32.png" sizes="32x32" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js" crossorigin></script>
    <script src="/docs/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        defaultModelsExpandDepth: 0,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
      });
    </script>
  </body>
</html>
`;

/**
 * Mounts GET /docs (Swagger UI), /openapi.yaml (the spec) and /docs/reference.md
 * (the prose reference) onto the given router.
 */
export function mountDocs(router) {
  const assets = require('swagger-ui-dist').getAbsoluteFSPath();

  // The page itself must win over the static handler, which would otherwise
  // serve swagger-ui-dist's own index.html (it points at the petstore demo).
  router.get(['/docs', '/docs/'], (req, res) => {
    res.type('html').send(PAGE);
  });

  router.get('/openapi.yaml', (req, res, next) => {
    res.type('application/yaml').sendFile(SPEC_FILE, (e) => (e ? next(e) : undefined));
  });

  router.get('/docs/reference.md', (req, res, next) => {
    res.type('text/markdown').sendFile(REFERENCE_FILE, (e) => (e ? next(e) : undefined));
  });

  router.use('/docs', express.static(assets, { index: false, redirect: false }));
}

/** DOCS_ENABLED: on by default; only an explicit false/0/off/no turns docs off. */
export function docsEnabled(env = process.env) {
  const raw = String(env.DOCS_ENABLED ?? '').trim().toLowerCase();
  if (raw === '') return true;
  return !['false', '0', 'off', 'no'].includes(raw);
}
