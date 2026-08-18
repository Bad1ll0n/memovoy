const express    = require('express');
const router     = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const controller = require('../controllers/notificationsController');

router.get('/',       checkAuthenticated, controller.getNotifications);
router.get('/count',  checkAuthenticated, controller.getCount);

module.exports = router;