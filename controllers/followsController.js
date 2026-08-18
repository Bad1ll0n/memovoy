const repo = require('../db/followsRepository');
const notifRepo = require('../db/notificationsRepository');
const { pool } = require('../config/dbConfig');

/* ── POST /follow/:userId ── */
const toggleFollow = async (req, res) => {
    try {
        const followerId  = req.user.Guid;
        const followingId = req.params.userId;

        if (followerId === followingId)
            return res.status(400).json({ error: 'Cannot follow yourself' });

        const already = await repo.isFollowing(followerId, followingId);
        if (already) {
            await repo.unfollow(followerId, followingId);
        } else {
            await repo.follow(followerId, followingId);
            await notifRepo.createNotification({ userId: followingId, actorId: followerId, type: 'follow' });
        }

        const counts = await repo.getFollowCounts(followingId);
        res.json({ following: !already, followers: counts.followers });
    } catch (err) {
        console.error('toggleFollow error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

/* ── GET /follow/:userId/status ── */
const followStatus = async (req, res) => {
    try {
        const following = await repo.isFollowing(req.user.Guid, req.params.userId);
        const counts    = await repo.getFollowCounts(req.params.userId);
        res.json({ following, ...counts });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

/* ── GET /profile/:userId — public profile ── */
const getPublicProfile = async (req, res) => {
    try {
        const targetId  = req.params.userId;
        const myId      = req.user.Guid;

        const { rows: userRows } = await pool.query(
            `SELECT "Guid","Name","Username","Avatar_Url","Header_Url","Bio","Location","Created_at"
             FROM public."Users" WHERE "Guid" = $1`,
            [targetId]
        );
        if (!userRows.length) return res.status(404).render('404');

        const targetUser = userRows[0];
        const counts     = await repo.getFollowCounts(targetId);
        const isFollowingTarget = await repo.isFollowing(myId, targetId);

        const { rows: posts } = await pool.query(
            `SELECT p.*, i.title AS "T_NOME", i.destination AS "DESTINATION",
                EXISTS (
                    SELECT 1 FROM "Post_Likes" pl
                    WHERE pl."G_POST_ID" = p."G_POST_ID" AND pl."G_USER_ID" = $2
                ) AS user_has_liked
             FROM public."POSTS" p
             LEFT JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
             WHERE p."G_USER" = $1
             ORDER BY p."D_CREATE_DATE" DESC`,
            [targetId, myId]
        );

        res.render('public_profile', {
            profileUser: targetUser,
            user: req.user,
            posts,
            followers:  counts.followers,
            following:  counts.following,
            isFollowing: isFollowingTarget,
            isOwnProfile: myId === targetId
        });
    } catch (err) {
        console.error('getPublicProfile error:', err);
        res.status(500).send('Server error');
    }
};

/* ── GET /follow/:userId/list ── (followers/following lists) ── */
const getFollowersList = async (req, res) => {
    try {
        const { tab = 'followers' } = req.query;
        const targetId = req.params.userId;
        const followers = await repo.getFollowers(targetId);
        const following = await repo.getFollowing(targetId);
        res.json({ followers, following });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = { toggleFollow, followStatus, getPublicProfile, getFollowersList };