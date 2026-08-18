const { pool } = require("../config/dbConfig");
const { processAndUploadFiles } = require("../services/s3Service");
const followsRepo = require("../db/followsRepository");

// GET /profile
const getProfile = async (req, res) => {
    try {
        const userId = req.user.Guid;
        const [postsResult, followCounts] = await Promise.all([
            pool.query(
                `SELECT p.*, i.title AS "T_NOME", i.destination AS "DESTINATION",
                    EXISTS (
                        SELECT 1 FROM "Post_Likes" pl
                        WHERE pl."G_POST_ID" = p."G_POST_ID" AND pl."G_USER_ID" = $1
                    ) AS user_has_liked
                FROM public."POSTS" p
                LEFT JOIN public.itineraries i ON p."G_ROTEIRO_ID" = i.id
                WHERE p."G_USER" = $1
                ORDER BY p."D_CREATE_DATE" DESC`,
                [userId]
            ),
            followsRepo.getFollowCounts(userId)
        ]);
        res.render("profile", {
            user: req.user, posts: postsResult.rows,
            followers: followCounts.followers, following: followCounts.following
        });
    } catch (err) {
        console.error("Erro ao carregar perfil:", err);
        res.render("profile", { user: req.user, posts: [], followers: 0, following: 0 });
    }
};

// POST /profile/edit
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.Guid;
        const { name, username, location, bio, website } = req.body;
        let newAvatarUrl = null, newCoverUrl = null;
        if (req.files && req.files['avatar']) {
            const urls = await processAndUploadFiles(req.files['avatar']);
            newAvatarUrl = urls[0];
        }
        if (req.files && req.files['cover']) {
            const urls = await processAndUploadFiles(req.files['cover']);
            newCoverUrl = urls[0];
        }
        await pool.query(
            `UPDATE public."Users" SET "Name"=$1,"Username"=$2,"Location"=$3,"Bio"=$4,
             "Avatar_Url"=COALESCE($5,"Avatar_Url"),"Header_Url"=COALESCE($6,"Header_Url")
             WHERE "Guid"=$7`,
            [name, username, location, bio, newAvatarUrl, newCoverUrl, userId]
        );
        res.redirect('/profile');
    } catch (err) {
        console.error("Erro ao atualizar perfil:", err);
        res.render("profile_edit", { user: req.user, error: "Erro ao guardar alterações." });
    }
};

module.exports = { getProfile, updateProfile };