import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = path.join(projectRoot, 'dist');
const dataRoot = path.join(projectRoot, 'public', 'dados');
const instanceId = crypto.createHash('sha256').update(projectRoot.toLowerCase()).digest('hex').slice(0, 16);
const host = '127.0.0.1';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};

function openUrl(url) {
  let command;
  let args;
  if (process.platform === 'win32') { command = 'cmd.exe'; args = ['/d', '/c', 'start', '', url]; }
  else if (process.platform === 'darwin') { command = 'open'; args = [url]; }
  else { command = 'xdg-open'; args = [url]; }
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.once('error', () => console.log(`Abra o navegador em ${url}`));
  child.unref();
}

function existingInstance(port) {
  return new Promise((resolve) => {
    const request = http.get({ host, port, path: '/__scdp_health', timeout: 700 }, (response) => {
      let content = '';
      response.on('data', (chunk) => {
        content += chunk;
        if (content.length > 4096) request.destroy();
      });
      response.on('end', () => {
        try {
          const result = JSON.parse(content);
          resolve(result.app === 'scdp-local' && result.instanceId === instanceId);
        } catch { resolve(false); }
      });
      response.on('error', () => resolve(false));
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function reply(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(message);
}

async function serveRequest(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return reply(response, 405, 'Método não permitido.');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
  catch { return reply(response, 400, 'Endereço inválido.'); }
  if (pathname === '/__scdp_health') {
    response.writeHead(200, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
    return response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ app: 'scdp-local', instanceId }));
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    return reply(response, 403, 'Caminho não permitido.');
  }
  const isData = pathname.startsWith('/dados/');
  const root = isData ? dataRoot : buildRoot;
  const relative = isData ? pathname.slice('/dados/'.length) : pathname.slice(1) || 'index.html';
  let filename = path.resolve(root, relative);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) return reply(response, 403, 'Caminho não permitido.');
  let stat;
  try { stat = await fsp.stat(filename); }
  catch {
    if (!isData && !path.extname(pathname)) {
      filename = path.join(buildRoot, 'index.html');
      try { stat = await fsp.stat(filename); } catch { return reply(response, 404, 'Arquivo não encontrado.'); }
    } else return reply(response, 404, isData ? 'Base local não encontrada. Atualize as bases ou importe os CSVs no painel.' : 'Arquivo não encontrado.');
  }
  if (!stat.isFile()) return reply(response, 404, 'Arquivo não encontrado.');
  response.writeHead(200, {
    'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': isData ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') return response.end();
  const stream = fs.createReadStream(filename);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

export async function startServer({ openBrowser = false, port = 4173 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65515) throw new Error('Porta local inválida.');
  try { await fsp.access(path.join(buildRoot, 'index.html')); }
  catch { throw new Error('A pasta dist não foi encontrada. Execute npm install e npm run build antes de iniciar o painel.'); }
  for (let candidate = port; candidate < port + 20; candidate += 1) {
    if (await existingInstance(candidate)) {
      const url = `http://${host}:${candidate}`;
      console.log(`Painel já aberto nesta pasta. Reutilizando ${url}`);
      if (openBrowser) openUrl(url);
      return { server: null, url, port: candidate, reused: true };
    }
    const server = http.createServer((request, response) => {
      serveRequest(request, response).catch(() => {
        if (!response.headersSent) reply(response, 500, 'Não foi possível ler o arquivo local.');
        else response.destroy();
      });
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(candidate, host, () => { server.removeListener('error', reject); resolve(); });
      });
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        console.log(`Porta ${candidate} ocupada por outro programa. Tentando ${candidate + 1}.`);
        continue;
      }
      throw error;
    }
    const url = `http://${host}:${candidate}`;
    console.log(`SCDP disponível em ${url}`);
    console.log('Mantenha esta janela aberta. Use Ctrl+C para encerrar o servidor local.');
    if (openBrowser) openUrl(url);
    return { server, url, port: candidate, reused: false };
  }
  throw new Error(`As portas locais ${port}–${port + 19} estão ocupadas. Feche uma instância deste painel e tente novamente.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer({ openBrowser: process.argv.includes('--open') }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
