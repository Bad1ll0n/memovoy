const express = require('express');
const router = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/favoriteController');


router.get('/favorites', checkAuthenticated, controller.renderFavoritos);
router.get('/api/favorites', checkAuthenticated, controller.getFavoritesJson);

module.exports = router;