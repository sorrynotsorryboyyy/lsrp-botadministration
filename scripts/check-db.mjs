/**
 * Vérifie que DATABASE_URL est bien formée et que le serveur répond.
 *
 * Diagnostique avant de lancer une migration : les messages d'erreur de Prisma
 * sur les URL malformées sont trompeurs (« invalid port » pour un hôte
 * injoignable, par exemple). Aucun identifiant n'est affiché.
 *
 *   node scripts/check-db.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';

const CONNECT_TIMEOUT_MS = 8000;

function readUrl() {
  // Priorité à l'environnement : c'est ce que voit Prisma sous `railway run`.
  if (process.env.DATABASE_URL) {
    return { value: process.env.DATABASE_URL, source: "variable d'environnement" };
  }

  if (!existsSync('.env')) return null;

  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL='));

  if (!line) return null;

  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  return value ? { value, source: '.env' } : null;
}

const found = readUrl();

if (!found) {
  console.error('✗ DATABASE_URL introuvable (ni dans .env, ni dans l\'environnement).');
  console.error('  → Renseignez MYSQL_PUBLIC_URL dans .env, ou utilisez `railway run`.');
  process.exit(1);
}

let url;
try {
  url = new URL(found.value);
} catch {
  console.error(`✗ URL non analysable (source : ${found.source}).`);
  process.exit(1);
}

console.log(`Source : ${found.source}`);
console.log(`Hôte   : ${url.hostname || '(vide)'}`);
console.log(`Port   : ${url.port || '(vide)'}`);
console.log(`Base   : ${url.pathname.slice(1) || '(vide)'}`);
console.log('');

if (!url.hostname) {
  console.error('✗ Hôte absent — la chaîne ressemble à `...@:/railway`.');
  console.error('  → Copiez MYSQL_PUBLIC_URL depuis Railway (Variables), sans la retoucher.');
  process.exit(1);
}

if (!url.port) {
  console.error('✗ Port absent.');
  process.exit(1);
}

if (url.hostname.endsWith('.railway.internal')) {
  console.error('✗ Hôte interne à Railway : injoignable depuis cette machine.');
  console.error('  → Utilisez MYSQL_PUBLIC_URL (hôte en .proxy.rlwy.net), ou `railway run`.');
  process.exit(1);
}

const socket = createConnection({ host: url.hostname, port: Number(url.port) }, () => {
  console.log('✓ Le serveur répond. Vous pouvez lancer :');
  console.log('  npx prisma migrate dev --name init');
  socket.destroy();
  process.exit(0);
});

socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
  console.error(`✗ Délai dépassé après ${CONNECT_TIMEOUT_MS / 1000}s.`);
  console.error('  → Vérifiez que Public Access est activé sur le service MySQL.');
  socket.destroy();
  process.exit(1);
});

socket.on('error', (error) => {
  console.error(`✗ Connexion impossible (${error.code ?? error.message}).`);
  if (error.code === 'ENOTFOUND') {
    console.error("  → L'hôte n'existe pas. Recopiez MYSQL_PUBLIC_URL depuis Railway.");
  } else if (error.code === 'ECONNREFUSED') {
    console.error('  → Port fermé. Activez Public Access sur le service MySQL.');
  }
  process.exit(1);
});
