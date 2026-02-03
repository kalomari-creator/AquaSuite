const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');

const PORT = process.env.UI_PORT || 8081;
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3000';
const ROOT = process.env.UI_ROOT || '/var/www/aquasuite';

const proxy = httpProxy.createProxyServer({ target: API_TARGET, changeOrigin: true });

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': typeMap[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
    proxy.web(req, res, {}, () => {
      res.writeHead(502);
      res.end('Bad gateway');
    });
    return;
  }

  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(ROOT, decodeURIComponent(urlPath));
  serveFile(filePath, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`UI proxy server running on http://127.0.0.1:${PORT}`);
});
