const { pool } = require("../config/dbConfig");

function timeSince(date) {
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

const renderFavoritos = async (req, res) => {
    try {
        const userId = req.user.Guid;

        const query = `
            SELECT 
                i.title                    AS titulo,
                p."T_DESC"                 AS descricao,
                p."PHOTOS_URLS"->>0        AS imagem,
                p."D_CREATE_DATE"          AS data_criacao,
                u."Name"                   AS autor_nome,
                u."Avatar_Url"             AS autor_avatar
            FROM public."Post_Likes" f
            JOIN public."POSTS" p       ON f."G_POST_ID"      = p."G_POST_ID"
            LEFT JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
            JOIN public."Users" u       ON p."G_USER"          = u."Guid"
            WHERE f."G_USER_ID" = $1
            ORDER BY f."D_CREATED_AT" DESC`;

        const { rows } = await pool.query(query, [userId]);

        const favoritosFormatados = rows.map(fav => ({
            ...fav,
            tempo_atras: fav.data_criacao ? timeSince(fav.data_criacao) : "DATA DESCONHECIDA",
        }));

        res.render("profile_favorites", {
            user:      req.user,
            favoritos: favoritosFormatados,
        });

    } catch (err) {
        console.error("Erro no favoriteController:", err);
        res.status(500).send("Erro");
    }
};

const getFavoritesJson = async (req, res) => {
    try {
        const userId = req.user.Guid;
        const query = `
            SELECT
                p."G_POST_ID",
                p."T_DESC",
                p."PHOTOS_URLS",
                p."D_CREATE_DATE",
                p."N_LIKES",
                p."N_COMMENTS",
                u."Name"       AS poster_name,
                u."Avatar_Url" AS poster_avatar,
                i.title        AS roteiro_title,
                i.destination  AS roteiro_destination
            FROM public."Post_Likes" f
            JOIN public."POSTS" p          ON f."G_POST_ID"       = p."G_POST_ID"
            JOIN public."Users" u          ON p."G_USER"           = u."Guid"
            LEFT JOIN public.itineraries i ON p."G_ROTEIRO_ID"    = i.id
            WHERE f."G_USER_ID" = $1
            ORDER BY f."D_CREATED_AT" DESC`;

        const { rows } = await pool.query(query, [userId]);
        res.json(rows);
    } catch (err) {
        console.error('getFavoritesJson error:', err);
        res.status(500).json([]);
    }
};

module.exports = { renderFavoritos, getFavoritesJson };