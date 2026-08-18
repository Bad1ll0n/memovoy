// middleware/feedMiddleware.js

const db   = require('../config/dbConfig');
const repo = require('../db/itineraryRepository');

const carregarPostsHome = async (req, res, next) => {
    try {
        const query = `
            SELECT p.*, u."First_Name", u."Avatar_Url"
            FROM public."POSTS" p
            JOIN public."Users" u ON p."G_USER" = u."Guid"
            ORDER BY p."D_CREATE_DATE" DESC
        `;
        const result = await db.pool.query(query);
        res.locals.posts = result.rows;

        // Roteiros guardados do utilizador para o select do modal
        if (req.user?.Guid) {
            res.locals.userItineraries = await repo.getUserItineraries(req.user.Guid);
        } else {
            res.locals.userItineraries = [];
        }

        next();
    } catch (err) {
        console.error("Erro ao carregar feed:", err);
        res.status(500).send("Erro ao carregar o feed");
    }
};

module.exports = { carregarPostsHome };