const { pool } = require("../config/dbConfig");
const { processAndUploadFiles } = require("../services/s3Service");

const createPost = async (req, res) => {
    try {
        const { roteiro_id, descricao } = req.body;

        const userId = req.user?.Guid;
        if (!userId) {
            return res.status(401).json({ error: "Utilizador não autenticado." });
        }

        // Fotos são opcionais quando se partilha um roteiro
        let fotosUrls = [];
        if (req.files && req.files.length > 0) {
            fotosUrls = await processAndUploadFiles(req.files);
        } else if (!roteiro_id) {
            // Se não há fotos NEM roteiro, rejeita
            return res.status(400).json({ error: "Envia pelo menos uma foto ou associa um roteiro." });
        }

        const query = `
            INSERT INTO "POSTS" ("G_ROTEIRO_ID", "T_DESC", "PHOTOS_URLS", "G_USER")
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const values = [
            roteiro_id || null,
            descricao  || null,
            JSON.stringify(fotosUrls),
            userId,
        ];

        const result = await pool.query(query, values);
        res.json({ success: true, post: result.rows[0] });

    } catch (err) {
        console.error('Erro no createPost:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { createPost };