const express = require('express');
const router  = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const {
    generateItinerary,
    viewItinerary,
    saveItinerary,
    suggestActivity,
    replaceActivity,
    reorderActivities,
    updateAllDays,
    getMyItineraries,
    geocodeDay,
    getRoute,
} = require('../controllers/itineraryController');

router.get('/mine',            checkAuthenticated, getMyItineraries);
router.post('/generate',       checkAuthenticated, generateItinerary);
router.get('/route',           checkAuthenticated, getRoute);
router.get('/:id',             checkAuthenticated, viewItinerary);
router.post('/:id/save',       checkAuthenticated, saveItinerary);
router.post('/:id/update',     checkAuthenticated, updateAllDays);
router.post('/:id/suggest',    checkAuthenticated, suggestActivity);
router.patch('/:id/activity',  checkAuthenticated, replaceActivity);
router.patch('/:id/reorder',   checkAuthenticated, reorderActivities);
router.post('/:id/geocode',    checkAuthenticated, geocodeDay);

module.exports = router;