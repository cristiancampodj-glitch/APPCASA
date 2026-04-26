/**
 * Casa SaaS - Servidor estático mínimo
 * Sin dependencias externas. Sirve los archivos del proyecto.
 * Compatible con Railway, Render, Fly, etc. (usa PORT del entorno)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Seguridad: prevenir path traversal
    const safePath = path.normalize(path.join(ROOT, urlPath));
    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403); return res.end('Forbidden');
    }

    fs.stat(safePath, (err, stat) => {
      if (err || !stat.isFile()) {
        // SPA fallback -> index.html
        const fallback = path.join(ROOT, 'index.html');
        return fs.readFile(fallback, (e, data) => {
          if (e) { res.writeHead(404); return res.end('Not Found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data);
        });
      }
      const ext = path.extname(safePath).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      const stream = fs.createReadStream(safePath);
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      stream.pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`🏡 Casa SaaS escuchando en puerto ${PORT}`);
});
