const repo = require('../db/notificationsRepository');

/* ── GET /notifications — lista ── */
const getNotifications = async (req, res) => {
    try {
        const notifications = await repo.getNotifications(req.user.Guid);
        await repo.markAllRead(req.user.Guid);
        res.render('notifications', { user: req.user, notifications });
    } catch (err) {
        console.error('getNotifications error:', err);
        res.status(500).send('Server error');
    }
};

/* ── GET /notifications/count — badge ── */
const getCount = async (req, res) => {
    try {
        const count = await repo.countUnread(req.user.Guid);
        res.json({ count });
    } catch (err) {
        res.status(500).json({ count: 0 });
    }
};

module.exports = { getNotifications, getCount };