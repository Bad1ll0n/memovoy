const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload'); // O ficheiro do Multer
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/postsController');

// Definimos a rota exatamente como o frontend espera: "/criar-post"
// Ordem: 1. Verifica Login -> 2. Processa Upload (Multer) -> 3. Executa Controlador
router.post('/criar-post', checkAuthenticated, upload.array('fotos', 10), controller.createPost);

module.exports = router;