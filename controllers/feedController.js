const { pool } = require("../config/dbConfig");
const notifRepo = require('../db/notificationsRepository');
const itinRepo  = require('../db/itineraryRepository');
const { parseCityCountry } = require('../data/cityCountryMap');

function timeSince(date) {
    if (!date) return "DATA DESCONHECIDA";
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return "HÁ " + Math.floor(interval) + " ANOS";
    interval = seconds / 2592000;
    if (interval > 1) return "HÁ " + Math.floor(interval) + " MESES";
    interval = seconds / 86400;
    if (interval > 1) return "HÁ " + Math.floor(interval) + " DIAS";
    interval = seconds / 3600;
    if (interval > 1) return "HÁ " + Math.floor(interval) + " HORAS";
    interval = seconds / 60;
    if (interval > 1) return "HÁ " + Math.floor(interval) + " MINUTOS";
    return "AGORA MESMO";
}

const getFeed = async (req, res, next) => {
    try {
        const currentUserId = req.user ? req.user.Guid : null;

        const result = await pool.query(
            `SELECT 
                p.*,
                u."First_Name",
                u."Avatar_Url",
                u."Guid" AS "poster_id",
                i.title  AS "T_NOME",
                i.destination,
                EXISTS (
                    SELECT 1 FROM "Post_Likes" pl
                    WHERE pl."G_POST_ID" = p."G_POST_ID" AND pl."G_USER_ID" = $1
                ) AS user_has_liked,
                EXISTS (
                    SELECT 1 FROM public.follows f
                    WHERE f.follower_id = $1 AND f.following_id = p."G_USER"
                ) AS is_following,
                (
                    SELECT json_agg(t) FROM (
                        SELECT c."S_COMMENT", cu."First_Name", cu."Avatar_Url", cu."Guid" AS "commenter_id"
                        FROM "POST_COMMENTS" c
                        JOIN "Users" cu ON c."G_USER_ID" = cu."Guid"
                        WHERE c."G_POST_ID" = p."G_POST_ID"
                        ORDER BY c."D_CREATE_DATE" DESC
                        LIMIT 2
                    ) t
                ) AS recent_comments
            FROM public."POSTS" p
            JOIN public."Users" u ON p."G_USER" = u."Guid"
            LEFT JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
            ORDER BY p."D_CREATE_DATE" DESC`,
            [currentUserId]
        );

        res.locals.posts = result.rows.map(post => ({
            ...post,
            tempo_atras: timeSince(post.D_CREATE_DATE),
        }));

        // Sugeridos para seguir
        const suggested = await pool.query(
            `SELECT u."Guid", u."Name", u."Username", u."Avatar_Url",
                (SELECT COUNT(*) FROM public.follows WHERE following_id = u."Guid") AS followers
             FROM public."Users" u
             WHERE u."Guid" <> $1
               AND NOT EXISTS (
                   SELECT 1 FROM public.follows f
                   WHERE f.follower_id = $1 AND f.following_id = u."Guid"
               )
             ORDER BY followers DESC
             LIMIT 3`,
            [currentUserId]
        );
        res.locals.suggestedUsers = suggested.rows;

        // Destinos em Alta — baseado nos posts com roteiro associado, com variação semanal
        const trendingRes = await pool.query(
            `SELECT
                i.destination,
                COUNT(p."G_POST_ID") AS post_count,
                COUNT(p."G_POST_ID") FILTER (
                    WHERE p."D_CREATE_DATE" >= NOW() - INTERVAL '7 days'
                ) AS posts_this_week,
                COUNT(p."G_POST_ID") FILTER (
                    WHERE p."D_CREATE_DATE" >= NOW() - INTERVAL '14 days'
                    AND p."D_CREATE_DATE" < NOW() - INTERVAL '7 days'
                ) AS posts_last_week
             FROM public."POSTS" p
             JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
             WHERE i.destination IS NOT NULL AND i.destination <> ''
             GROUP BY i.destination
             ORDER BY post_count DESC
             LIMIT 3`
        );
        res.locals.trendingDestinations = trendingRes.rows.map(row => {
            const thisWeek = parseInt(row.posts_this_week) || 0;
            const lastWeek = parseInt(row.posts_last_week) || 0;
            let pct = null;
            if (lastWeek > 0) {
                pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
            } else if (thisWeek > 0) {
                pct = 100;
            }
            const { city, country } = parseCityCountry(row.destination);
            return { city, country, post_count: row.post_count, pct };
        });

        // Roteiros do utilizador para o select do modal de partilha
        if (req.user?.Guid) {
            res.locals.userItineraries = await itinRepo.getUserItineraries(req.user.Guid);
        } else {
            res.locals.userItineraries = [];
        }

        next();
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Erro interno ao carregar feed: " + err.message);
    }
};

const toggleLike = async (req, res) => {
    const userId = req.user ? req.user.Guid : null;
    if (!userId) return res.status(401).json({ error: "Não autorizado" });

    const { postId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const checkLike = await client.query(
            'SELECT 1 FROM "Post_Likes" WHERE "G_USER_ID" = $1 AND "G_POST_ID" = $2',
            [userId, postId]
        );
        const hasLiked = checkLike.rows.length > 0;

        if (!hasLiked) {
            await client.query(
                'INSERT INTO "Post_Likes" ("G_USER_ID", "G_POST_ID") VALUES ($1, $2)',
                [userId, postId]
            );
            await client.query(
                'UPDATE "POSTS" SET "N_LIKES" = COALESCE("N_LIKES", 0) + 1 WHERE "G_POST_ID" = $1',
                [postId]
            );
            // Notificar dono do post
            const postOwner = await client.query('SELECT "G_USER" FROM "POSTS" WHERE "G_POST_ID" = $1', [postId]);
            if (postOwner.rows.length > 0) {
                await notifRepo.createNotification({ userId: postOwner.rows[0].G_USER, actorId: userId, type: 'like', postId });
            }
        } else {
            await client.query(
                'DELETE FROM "Post_Likes" WHERE "G_USER_ID" = $1 AND "G_POST_ID" = $2',
                [userId, postId]
            );
            await client.query(
                'UPDATE "POSTS" SET "N_LIKES" = GREATEST(0, "N_LIKES" - 1) WHERE "G_POST_ID" = $1',
                [postId]
            );
        }

        await client.query('COMMIT');
        res.json({ liked: !hasLiked });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro no Like Controller:', err);
        res.status(500).json({ error: 'Erro ao processar o gosto.' });
    } finally {
        client.release();
    }
};

const addComment = async (req, res) => {
    const userId = req.user ? req.user.Guid : null;
    const { postId } = req.params;
    const { commentText } = req.body;

    if (!userId) return res.status(401).json({ error: "Não autorizado" });
    if (!commentText || commentText.trim() === "") return res.status(400).json({ error: "Comentário vazio" });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO "POST_COMMENTS" ("G_POST_ID", "G_USER_ID", "S_COMMENT") VALUES ($1, $2, $3)`,
            [postId, userId, commentText]
        );
        await client.query(
            `UPDATE "POSTS" SET "N_COMMENTS" = COALESCE("N_COMMENTS", 0) + 1 WHERE "G_POST_ID" = $1`,
            [postId]
        );
        // Notificar dono do post
        const postOwner = await client.query('SELECT "G_USER" FROM "POSTS" WHERE "G_POST_ID" = $1', [postId]);
        if (postOwner.rows.length > 0) {
            await notifRepo.createNotification({ userId: postOwner.rows[0].G_USER, actorId: userId, type: 'comment', postId, message: commentText.substring(0, 80) });
        }

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro ao comentar:", err);
        res.status(500).json({ error: "Erro ao processar comentário" });
    } finally {
        client.release();
    }
};

const getComments = async (req, res) => {
    try {
        const { postId } = req.params;
        const { rows } = await pool.query(
            'SELECT c."S_COMMENT", c."D_CREATE_DATE", u."First_Name", u."Avatar_Url" FROM "POST_COMMENTS" c JOIN "Users" u ON c."G_USER_ID" = u."Guid" WHERE c."G_POST_ID" = $1 ORDER BY c."D_CREATE_DATE" ASC',
            [postId]
        );
        res.json(rows);
    } catch (err) {
        console.error('getComments error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

/* ── GET /dashboard/world-map-data ── */
const geoCache = {};

// Geocodifica cidades via Open-Meteo (sem rate limit, sem API key)
async function geocodeCity(destination) {
    const cityName = destination.split(',')[0].trim();
    const cacheKey = `city:${cityName}`;
    if (geoCache[cacheKey]) return geoCache[cacheKey];
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
        const res  = await fetch(url);
        const data = await res.json();
        if (data.results?.[0]) {
            const r = data.results[0];
            const coords = { lat: r.latitude, lon: r.longitude };
            geoCache[cacheKey] = coords;
            return coords;
        }
    } catch (e) { console.error('[geocodeCity] erro:', e.message); }
    return null;
}

// Geocodifica POIs/atividades via Photon (Komoot) — OSM, sem restrições
async function geocodeActivity(actName, cityName) {
    // Extrair nome real se vier no formato "Almoço no Café Angelina"
    const match = actName.match(/\b(?:no|na|nos|nas|ao|à|às|em|pelo|pela|pelos|pelas)\s+(.+)/i);
    const searchName = match ? match[1].trim() : actName;

    const cacheKey = `act:${searchName}|${cityName}`;
    if (geoCache[cacheKey]) return geoCache[cacheKey];
    try {
        const q = `${searchName}, ${cityName}`;
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
        const res  = await fetch(url, { headers: { 'User-Agent': 'InsightTravelApp/1.0' } });
        const data = await res.json();
        if (data.features?.[0]) {
            const [lon, lat] = data.features[0].geometry.coordinates;
            const coords = { lat, lon };
            geoCache[cacheKey] = coords;
            return coords;
        }
    } catch (e) { /* silencioso */ }
    return null;
}

const getWorldMapData = async (req, res) => {
    try {
        const userId = req.user.Guid;
        const { rows } = await pool.query(
            `SELECT i.destination, i.title, i.id AS itinerary_id, i.data,
                    p."D_CREATE_DATE"
             FROM public."POSTS" p
             JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
             WHERE p."G_USER" = $1 AND i.destination IS NOT NULL AND i.destination <> ''
             ORDER BY p."D_CREATE_DATE" DESC`,
            [userId]
        );

        // Geocodificar cada destino único e recolher atividades
        // Agrupar primeiro por string normalizada
        const byName = {};
        for (const row of rows) {
            const key = row.destination.toLowerCase().trim();
            if (!byName[key]) {
                const { city, country } = parseCityCountry(row.destination);
                byName[key] = { destination: row.destination, city, country, activities: [] };
            }
            const days = row.data?.days || [];
            for (const day of days) {
                for (const act of (day.activities || [])) {
                    if (act.type === 'transporte') continue;
                    if (!byName[key].activities.find(a => a.name === act.name)) {
                        byName[key].activities.push({
                            name:        act.name,
                            geoName:     act.geoName || act.name,
                            type:        act.type,
                            time:        act.time,
                            description: act.description || null,
                            lat:         null,
                            lon:         null,
                        });
                    }
                }
            }
        }

        // Geocodificar e depois fundir destinos com coordenadas próximas (mesmo lugar, nome diferente)
        const geocoded = [];
        for (const dest of Object.values(byName)) {
            console.log('[WorldMap] geocodificando:', dest.destination);
            const coords = await geocodeCity(dest.destination);
            console.log('[WorldMap] resultado:', dest.destination, '->', coords);
            if (coords) geocoded.push({ ...dest, lat: coords.lat, lon: coords.lon });
        }

        // Fundir pins que geocodificam para o mesmo ponto (arredondado a 2 casas = ~1km)
        const merged = {};
        for (const dest of geocoded) {
            const key = `${dest.lat.toFixed(2)},${dest.lon.toFixed(2)}`;
            if (!merged[key]) {
                merged[key] = { ...dest };
            } else {
                // Manter o nome com mais informação, fundir atividades
                for (const act of dest.activities) {
                    if (!merged[key].activities.find(a => a.name === act.name)) {
                        merged[key].activities.push(act);
                    }
                }
            }
        }

        // Geocodificar atividades de cada destino no servidor
        const destinations = Object.values(merged);
        for (const dest of destinations) {
            for (const act of dest.activities) {
                const coords = await geocodeActivity(act.geoName || act.name, dest.destination);
                if (coords) { act.lat = coords.lat; act.lon = coords.lon; }
            }
        }
        console.log('[WorldMap] total destinos:', destinations.length);

        res.json({ destinations });
    } catch (err) {
        console.error('getWorldMapData error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = { getFeed, toggleLike, addComment, getComments, getWorldMapData };