const express = require('express');
const router = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/feedController');

// ROTA CORRIGIDA: Agora passamos controller.getFeed
router.get("/", checkAuthenticated, controller.getFeed, (req, res) => {
    // O getFeed já colocou os dados em res.locals.posts, 
    // então o dashboard terá acesso a eles automaticamente.
    res.render("dashboard"); 
});

router.get('/world-map-data',   checkAuthenticated, controller.getWorldMapData);
router.post('/:postId/like',    checkAuthenticated, controller.toggleLike);
router.post('/:postId/comment', checkAuthenticated, controller.addComment);
router.get('/:postId/comments', checkAuthenticated, controller.getComments);

module.exports = router;