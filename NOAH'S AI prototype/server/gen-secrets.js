const crypto = require('node:crypto');
function secret() {
  return crypto.randomBytes(32).toString('base64url');
}
console.log('SESSION_SECRET=' + secret());
console.log('ENCRYPTION_KEY=' + secret());
