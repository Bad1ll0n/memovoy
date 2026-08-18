const express    = require('express');
const router     = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/messagesController');

router.get('/',         checkAuthenticated, controller.getInbox);
router.get('/:userId',  checkAuthenticated, controller.getConversation);

module.exports = router;