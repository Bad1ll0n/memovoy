const multer = require('multer');

// Configuração simples do Multer (Memory Storage)
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

module.exports = upload;