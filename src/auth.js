const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod-please';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

const hash = (pwd) => bcrypt.hash(pwd, 10);
const compare = (pwd, h) => bcrypt.compare(pwd, h);

const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
const verify = (token) => jwt.verify(token, JWT_SECRET);

module.exports = { hash, compare, sign, verify };
