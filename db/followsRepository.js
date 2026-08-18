const { pool } = require('../config/dbConfig');

/* ── Follow um utilizador ── */
async function follow(followerId, followingId) {
    await pool.query(
        `INSERT INTO public.follows (follower_id, following_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [followerId, followingId]
    );
}

/* ── Unfollow ── */
async function unfollow(followerId, followingId) {
    await pool.query(
        `DELETE FROM public.follows
         WHERE follower_id = $1 AND following_id = $2`,
        [followerId, followingId]
    );
}

/* ── Verificar se segue ── */
async function isFollowing(followerId, followingId) {
    const { rows } = await pool.query(
        `SELECT 1 FROM public.follows
         WHERE follower_id = $1 AND following_id = $2`,
        [followerId, followingId]
    );
    return rows.length > 0;
}

/* ── Contadores ── */
async function getFollowCounts(userId) {
    const { rows } = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM public.follows WHERE following_id = $1) AS followers,
            (SELECT COUNT(*) FROM public.follows WHERE follower_id  = $1) AS following`,
        [userId]
    );
    return { followers: parseInt(rows[0].followers), following: parseInt(rows[0].following) };
}

/* ── Lista de followers ── */
async function getFollowers(userId) {
    const { rows } = await pool.query(
        `SELECT u."Guid", u."Name", u."Username", u."Avatar_Url"
         FROM public.follows f
         JOIN public."Users" u ON u."Guid" = f.follower_id
         WHERE f.following_id = $1
         ORDER BY f.created_at DESC`,
        [userId]
    );
    return rows;
}

/* ── Lista de following ── */
async function getFollowing(userId) {
    const { rows } = await pool.query(
        `SELECT u."Guid", u."Name", u."Username", u."Avatar_Url"
         FROM public.follows f
         JOIN public."Users" u ON u."Guid" = f.following_id
         WHERE f.follower_id = $1
         ORDER BY f.created_at DESC`,
        [userId]
    );
    return rows;
}

/* ── IDs de quem o utilizador segue (para highlight no feed) ── */
async function getFollowingIds(userId) {
    const { rows } = await pool.query(
        `SELECT following_id FROM public.follows WHERE follower_id = $1`,
        [userId]
    );
    return rows.map(r => r.following_id);
}

module.exports = { follow, unfollow, isFollowing, getFollowCounts, getFollowers, getFollowing, getFollowingIds };