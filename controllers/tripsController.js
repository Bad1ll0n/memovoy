const { pool } = require("../config/dbConfig");
const repo = require('../db/itineraryRepository');
const countriesAndCities = require("../data/countries");

// --- Renderização de Vistas ---

const renderAutomatic = (req, res) => {
    const { departureDate, returnDate, selectedCity } = req.query;
    res.render("automaticRoteiro", { departureDate, returnDate, selectedCity });
};

const renderManual = (req, res) => {
    const { departureDate, returnDate, selectedCity } = req.query;
    res.render("manualRoteiro", { departureDate, returnDate, selectedCity, user: req.user });
};

const renderResumo = (req, res) => {
    res.render("resumoRoteiro", { user: req.user });
};

const renderTrips = (req, res) => {
    res.render("trips", {});
};

const renderProfileTrips = (req, res) => {
    res.render("myTrips", { user: req.user });
};

// --- Lógica de API ---

const searchDestinations = (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : "";
    if (!query) return res.json([]);

    const results = [];
    countriesAndCities.forEach(({ country, cities }) => {
        if (country.toLowerCase().includes(query)) {
            results.push({ type: "country", name: country, cities });
        }
        cities.forEach((city) => {
            if (city.toLowerCase().includes(query)) {
                results.push({ type: "city", name: city, country });
            }
        });
    });
    res.json(results);
};

// Obter os Meus Roteiros — agora da tabela itineraries
const getMyTrips = async (req, res) => {
    try {
        const userId = req.user.Guid;
        const itineraries = await repo.getUserItineraries(userId);
        res.json(itineraries);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar roteiros');
    }
};

// Apagar Roteiro — agora da tabela itineraries
const deleteRoteiro = async (req, res) => {
    try {
        const { roteiroId } = req.query;
        const userId = req.user.Guid;

        await repo.deleteItinerary(roteiroId, userId);
        res.send("Roteiro removido com sucesso.");
    } catch (err) {
        console.error("Erro ao eliminar roteiro:", err.message);
        res.status(500).send("Erro interno ao eliminar da BD.");
    }
};

// Pontos Turísticos
const getTouristSpots = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, address, latitude, longitude, type FROM tourist_spots LIMIT 10'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro no servidor.');
    }
};

module.exports = {
    renderAutomatic,
    renderManual,
    renderResumo,
    renderTrips,
    renderProfileTrips,
    searchDestinations,
    getMyTrips,
    deleteRoteiro,
    getTouristSpots,
};