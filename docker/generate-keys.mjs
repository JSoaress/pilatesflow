#!/usr/bin/env node
// Gera JWT_SECRET, ANON_KEY e SERVICE_ROLE_KEY para a stack Docker.
// Uso:
//   node docker/generate-keys.mjs                 # segredo aleatório
//   node docker/generate-keys.mjs "meu-segredo"   # segredo próprio (mínimo 32 caracteres)
import { createHmac, randomBytes } from 'node:crypto';

const secret = process.argv[2] ?? randomBytes(32).toString('hex');
if (secret.length < 32) {
  console.error('JWT_SECRET precisa ter no mínimo 32 caracteres.');
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function sign(role) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  // 10 anos — são chaves de API, não tokens de sessão.
  const body = b64({ role, iss: 'pilatesflow', iat: now, exp: now + 10 * 365 * 24 * 3600 });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${sign('anon')}`);
console.log(`SERVICE_ROLE_KEY=${sign('service_role')}`);
