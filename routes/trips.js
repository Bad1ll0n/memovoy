const express = require('express');
const router = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/tripsController');

// --- Rotas de Vistas ---
router.get('/automaticRoteiro',  controller.renderAutomatic);
router.get('/resumoRoteiro',     checkAuthenticated, controller.renderResumo);
router.get('/users/trips',       checkAuthenticated, controller.renderTrips);
router.get('/profile_trips',     checkAuthenticated, controller.renderProfileTrips);

// --- Rotas de API ---
router.get('/search',            controller.searchDestinations);
router.get('/pontos-turisticos', controller.getTouristSpots);
router.get('/myTrips',           checkAuthenticated, controller.getMyTrips);
router.delete('/delete-roteiro', checkAuthenticated, controller.deleteRoteiro);

module.exports = router;