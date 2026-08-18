const express = require('express');
const router  = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/followsController');

router.post('/:userId',       checkAuthenticated, controller.toggleFollow);
router.get('/:userId/status', checkAuthenticated, controller.followStatus);
router.get('/:userId/list',   checkAuthenticated, controller.getFollowersList);

module.exports = router;