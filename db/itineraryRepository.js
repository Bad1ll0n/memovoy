// db/itineraryRepository.js
// Todas as queries à tabela itineraries num só lugar

const pool = require('./index');

/* ── Guarda um novo roteiro (UUID gerado pelo Postgres) ── */
async function saveItinerary({ userId, title, itinerary, isManual = false }) {
    const { destinationInfo, params, days } = itinerary;

    const sql = `
        INSERT INTO itineraries
            (user_id, title, destination, departure_date, return_date, days_count, is_manual, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`;

    const values = [
        userId || null,
        title,
        destinationInfo.normalizedName,
        params.departureDate,
        params.returnDate,
        days.length,
        isManual,
        JSON.stringify(itinerary),
    ];

    const { rows } = await pool.query(sql, values);
    return rows[0].id; // UUID gerado pelo Postgres
}

/* ── Atualiza título e dados de um roteiro existente ── */
async function updateItinerary({ id, title, itinerary }) {
    const sql = `
        UPDATE itineraries
        SET title = $1, data = $2
        WHERE id = $3`;
    await pool.query(sql, [title, JSON.stringify(itinerary), id]);
}

/* ── Busca um roteiro por ID ── */
async function getItineraryById(id) {
    const { rows } = await pool.query(
        'SELECT * FROM itineraries WHERE id = $1',
        [id]
    );
    return rows[0] || null;
}

/* ── Lista os roteiros de um user (paginados) ── */
async function getUserItineraries(userId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await pool.query(
        `SELECT id, title, destination, departure_date, return_date, days_count, is_manual, created_at
         FROM itineraries
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );
    return rows;
}

/* ── Atualiza apenas o conteúdo (drag, swap, duração) ── */
async function updateItineraryData(id, itinerary) {
    await pool.query(
        'UPDATE itineraries SET data = $1 WHERE id = $2',
        [JSON.stringify(itinerary), id]
    );
}

/* ── Apaga um roteiro ── */
async function deleteItinerary(id, userId) {
    await pool.query(
        'DELETE FROM itineraries WHERE id = $1 AND user_id = $2',
        [id, userId]
    );
}

module.exports = {
    saveItinerary,
    updateItinerary,
    getItineraryById,
    getUserItineraries,
    updateItineraryData,
    deleteItinerary,
};