/* Servidor estático mínimo para a bateria — evita depender de `npx http-server`
   e do registro npm só para servir arquivos. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PORTA = Number(process.env.PORTA_WEB || 8080);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let alvo = path.join(RAIZ, url === '/' ? 'index.html' : url);
  // Nunca servir fora da raiz do projeto.
  if (!alvo.startsWith(RAIZ)) { res.statusCode = 403; return res.end('fora da raiz'); }
  if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
  fs.readFile(alvo, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('nao encontrado'); }
    res.setHeader('Content-Type', TIPOS[path.extname(alvo)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  });
}).listen(PORTA, () => console.log('site estático :' + PORTA));
