const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'mi-casa';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'mi-casa-app';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (ENV === 'production') {
    console.error('[FATAL] JWT_SECRET ausente o demasiado corto (mínimo 32 caracteres). Define una variable JWT_SECRET segura.');
    process.exit(1);
  } else {
    console.warn('[WARN] JWT_SECRET no configurado; usando uno aleatorio temporal solo para desarrollo.');
  }
}
const SECRET = JWT_SECRET || require('crypto').randomBytes(48).toString('hex');

const hash = (pwd) => bcrypt.hash(pwd, BCRYPT_ROUNDS);
const compare = (pwd, h) => bcrypt.compare(pwd, h);

const sign = (payload) =>
  jwt.sign(payload, SECRET, {
    expiresIn: JWT_EXPIRES,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256'
  });

const verify = (token) =>
  jwt.verify(token, SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256']
  });

module.exports = { hash, compare, sign, verify };
