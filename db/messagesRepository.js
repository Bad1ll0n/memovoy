const { pool } = require('../config/dbConfig');

/* ── Obter ou criar conversa entre dois utilizadores ── */
async function getOrCreateConversation(userA, userB) {
    // Garante ordem consistente (user1_id < user2_id)
    const [u1, u2] = [userA, userB].sort();

    const { rows } = await pool.query(
        `INSERT INTO public.conversations (user1_id, user2_id)
         VALUES ($1, $2)
         ON CONFLICT (user1_id, user2_id) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [u1, u2]
    );
    return rows[0].id;
}

/* ── Listar conversas do utilizador com última mensagem ── */
async function getUserConversations(userId) {
    const { rows } = await pool.query(
        `SELECT
            c.id,
            c.updated_at,
            -- O outro utilizador
            CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END AS other_id,
            u."Name"       AS other_name,
            u."Username"   AS other_username,
            u."Avatar_Url" AS other_avatar,
            -- Última mensagem
            m.content      AS last_message,
            m.sender_id    AS last_sender,
            m.created_at   AS last_at,
            -- Mensagens não lidas
            (SELECT COUNT(*) FROM public.messages
             WHERE conversation_id = c.id AND sender_id <> $1 AND read = FALSE) AS unread
         FROM public.conversations c
         JOIN public."Users" u ON u."Guid" = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
         LEFT JOIN LATERAL (
             SELECT content, sender_id, created_at FROM public.messages
             WHERE conversation_id = c.id
             ORDER BY created_at DESC LIMIT 1
         ) m ON TRUE
         WHERE c.user1_id = $1 OR c.user2_id = $1
         ORDER BY c.updated_at DESC`,
        [userId]
    );
    return rows;
}

/* ── Mensagens de uma conversa ── */
async function getMessages(conversationId, limit = 50) {
    const { rows } = await pool.query(
        `SELECT m.id, m.sender_id, m.content, m.read, m.created_at,
                u."Name" AS sender_name, u."Avatar_Url" AS sender_avatar
         FROM public.messages m
         JOIN public."Users" u ON u."Guid" = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC
         LIMIT $2`,
        [conversationId, limit]
    );
    return rows;
}

/* ── Guardar mensagem ── */
async function saveMessage(conversationId, senderId, content) {
    const { rows } = await pool.query(
        `INSERT INTO public.messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, sender_id, content, created_at`,
        [conversationId, senderId, content]
    );
    return rows[0];
}

/* ── Marcar mensagens como lidas ── */
async function markAsRead(conversationId, userId) {
    await pool.query(
        `UPDATE public.messages
         SET read = TRUE
         WHERE conversation_id = $1 AND sender_id <> $2 AND read = FALSE`,
        [conversationId, userId]
    );
}

/* ── Contar mensagens não lidas total ── */
async function countUnread(userId) {
    const { rows } = await pool.query(
        `SELECT COUNT(*) AS total
         FROM public.messages m
         JOIN public.conversations c ON c.id = m.conversation_id
         WHERE (c.user1_id = $1 OR c.user2_id = $1)
           AND m.sender_id <> $1
           AND m.read = FALSE`,
        [userId]
    );
    return parseInt(rows[0].total);
}

module.exports = {
    getOrCreateConversation,
    getUserConversations,
    getMessages,
    saveMessage,
    markAsRead,
    countUnread
};