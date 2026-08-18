const { pool } = require('../config/dbConfig');

/* GET /users/search?q=... */
const searchUsers = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();

        const { rows } = await pool.query(
            `SELECT
                u."Guid", u."Name", u."Username", u."Avatar_Url", u."Location", u."Bio",
                (SELECT COUNT(*) FROM public.follows WHERE following_id = u."Guid") AS followers
             FROM public."Users" u
             WHERE u."Guid" <> $1
               AND (
                 $2 = '' OR
                 LOWER(u."Name")     LIKE LOWER($3) OR
                 LOWER(u."Username") LIKE LOWER($3)
               )
             ORDER BY followers DESC
             LIMIT 20`,
            [req.user.Guid, q, `%${q}%`]
        );
        res.json(rows);
    } catch (err) {
        console.error('searchUsers error:', err);
        res.status(500).json([]);
    }
};

/* GET /users — página de pesquisa */
const searchPage = (req, res) => {
    res.render('search', { user: req.user });
};

module.exports = { searchUsers, searchPage };