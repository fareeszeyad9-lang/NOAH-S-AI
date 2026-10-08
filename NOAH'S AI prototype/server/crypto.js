const crypto = require('node:crypto');

function sessionSecret() {
  return process.env.SESSION_SECRET || 'dev-only-change-me';
}

function encryptionKey() {
  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || sessionSecret()).digest();
}

function encryptJson(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptJson(payload) {
  if (!payload) return {};
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function randomId() {
  return crypto.randomBytes(24).toString('hex');
}

function signCookie(value) {
  const hmac = crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
  return `${value}.${hmac}`;
}

function verifyCookie(signed) {
  if (!signed || !signed.includes('.')) return null;
  const idx = signed.lastIndexOf('.');
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

module.exports = { encryptJson, decryptJson, randomId, signCookie, verifyCookie };
