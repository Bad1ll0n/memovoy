const repo = require('../db/messagesRepository');

/* ── GET /messages — inbox ── */
const getInbox = async (req, res) => {
    try {
        const conversations = await repo.getUserConversations(req.user.Guid);
        res.render('messages', { user: req.user, conversations });
    } catch (err) {
        console.error('getInbox error:', err);
        res.status(500).send('Server error');
    }
};

/* ── GET /messages/:userId — abrir conversa com utilizador ── */
const getConversation = async (req, res) => {
    try {
        const myId       = req.user.Guid;
        const otherId    = req.params.userId;
        const convId     = await repo.getOrCreateConversation(myId, otherId);
        const messages   = await repo.getMessages(convId);
        const convList   = await repo.getUserConversations(myId);

        // Marcar como lidas
        await repo.markAsRead(convId, myId);

        // Info do outro utilizador
        const { pool } = require('../config/dbConfig');
        const { rows } = await pool.query(
            `SELECT "Guid","Name","Username","Avatar_Url" FROM public."Users" WHERE "Guid" = $1`,
            [otherId]
        );
        const otherUser = rows[0];

        res.render('messages', {
            user: req.user,
            conversations: convList,
            activeConv: { id: convId, otherUser, messages }
        });
    } catch (err) {
        console.error('getConversation error:', err);
        res.status(500).send('Server error');
    }
};

module.exports = { getInbox, getConversation };