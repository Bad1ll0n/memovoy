// controllers/manualItineraryController.js

const {
    suggestActivitiesForDay,
    searchActivity,
    buildManualItinerary,
} = require('../services/itineraryAgentService');

const itineraryStore = require('../store/itineraryStore');

/* ─────────────────────────────────────────
   GET /manualRoteiro
───────────────────────────────────────── */
function viewManualBuilder(req, res) {
    const { selectedCity, departureDate, returnDate } = req.query;

    if (!selectedCity || !departureDate || !returnDate) {
        return res.redirect('/');
    }

    const days = [];
    const start = new Date(departureDate);
    const end   = new Date(returnDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push({
            dayNumber:    days.length + 1,
            date:         d.toISOString().split('T')[0],
            title:        `Dia ${days.length + 1}`,
            theme:        '',
            highlight:    '',
            totalDayCost: '—',
            activities:   [],
        });
    }

    return res.render('manualRoteiro', {
        destination:   selectedCity,
        departureDate,
        returnDate,
        days:          JSON.stringify(days),
        user:          req.user || {},
    });
}

/* ─────────────────────────────────────────
   POST /manualRoteiro/suggest
───────────────────────────────────────── */
async function suggestForDay(req, res) {
    try {
        const { destination, date, dayNumber, existingActivities } = req.body;
        const result = await suggestActivitiesForDay(destination, date, dayNumber, existingActivities || []);
        return res.json({ success: true, suggestions: result.suggestions });
    } catch (err) {
        console.error('[manualController] suggest:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/* ─────────────────────────────────────────
   POST /manualRoteiro/search
───────────────────────────────────────── */
async function searchForActivity(req, res) {
    try {
        const { query, destination } = req.body;
        if (!query || !destination) {
            return res.status(400).json({ success: false, error: 'Parâmetros em falta.' });
        }
        const result = await searchActivity(query, destination);
        return res.json({ success: true, activity: result });
    } catch (err) {
        console.error('[manualController] search:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/* ─────────────────────────────────────────
   POST /manualRoteiro/save
───────────────────────────────────────── */
function saveManualItinerary(req, res) {
    try {
        const { destination, departureDate, returnDate, days } = req.body;

        if (!destination || !departureDate || !returnDate || !days) {
            return res.status(400).json({ success: false, error: 'Dados incompletos.' });
        }

        const itinerary   = buildManualItinerary({ destination, departureDate, returnDate }, days);
        const itineraryId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        itineraryStore[itineraryId] = { id: itineraryId, userId: req.user?.Guid || null, ...itinerary };

        return res.json({ success: true, itineraryId });
    } catch (err) {
        console.error('[manualController] save:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = { viewManualBuilder, suggestForDay, searchForActivity, saveManualItinerary };