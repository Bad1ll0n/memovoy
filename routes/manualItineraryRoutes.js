const express = require('express');
const router  = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const {
    viewManualBuilder,
    suggestForDay,
    searchForActivity,
    saveManualItinerary,
} = require('../controllers/manualItineraryController');
const { geocodeDay, getRoute } = require('../controllers/itineraryController');

router.get('/', checkAuthenticated, viewManualBuilder);
router.post('/suggest', checkAuthenticated, suggestForDay);
router.post('/search', checkAuthenticated, searchForActivity);
router.post('/save', checkAuthenticated, saveManualItinerary);
router.post('/geocode', checkAuthenticated, geocodeDay);
router.get('/route', checkAuthenticated, getRoute);

module.exports = router;