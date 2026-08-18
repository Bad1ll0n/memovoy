const { pool } = require('../config/dbConfig');

/* ── Criar notificação ── */
async function createNotification({ userId, actorId, type, postId = null, message = null }) {
    // Não notificar a própria pessoa
    if (userId === actorId) return;

    // Evitar duplicados de like/follow
    if (type === 'like' || type === 'follow') {
        const { rows } = await pool.query(
            `SELECT 1 FROM public.notifications
             WHERE user_id=$1 AND actor_id=$2 AND type=$3 AND (post_id=$4 OR $4 IS NULL)`,
            [userId, actorId, type, postId]
        );
        if (rows.length > 0) return;
    }

    await pool.query(
        `INSERT INTO public.notifications (user_id, actor_id, type, post_id, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, actorId, type, postId, message]
    );

    // Emite em tempo real via Socket.io
    if (global._io) {
        const unread = await countUnread(userId);
        global._io.to('user:' + userId).emit('new_notification', {
            type,
            unread
        });
    }
}

/* ── Listar notificações do utilizador ── */
async function getNotifications(userId, limit = 20) {
    const { rows } = await pool.query(
        `SELECT
            n.id, n.type, n.post_id, n.message, n.read, n.created_at,
            u."Guid"       AS actor_id,
            u."Name"       AS actor_name,
            u."Username"   AS actor_username,
            u."Avatar_Url" AS actor_avatar
         FROM public.notifications n
         JOIN public."Users" u ON u."Guid" = n.actor_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2`,
        [userId, limit]
    );
    return rows;
}

/* ── Contar não lidas ── */
async function countUnread(userId) {
    const { rows } = await pool.query(
        `SELECT COUNT(*) AS total FROM public.notifications
         WHERE user_id = $1 AND read = FALSE`,
        [userId]
    );
    return parseInt(rows[0].total);
}

/* ── Marcar todas como lidas ── */
async function markAllRead(userId) {
    await pool.query(
        `UPDATE public.notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
        [userId]
    );
}

/* ── Marcar uma como lida ── */
async function markRead(notifId, userId) {
    await pool.query(
        `UPDATE public.notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
        [notifId, userId]
    );
}

module.exports = { createNotification, getNotifications, countUnread, markAllRead, markRead };