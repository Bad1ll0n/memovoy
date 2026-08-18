// db/index.js
// Reutiliza o pool existente do dbConfig.js — não cria um segundo pool

const { pool } = require('../config/dbConfig');

module.exports = pool;