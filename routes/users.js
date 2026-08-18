const express = require('express');
const router  = express.Router();
const { checkAuthenticated } = require('../middleware/auth');
const { searchUsers, searchPage } = require('../controllers/usersController');

router.get('/',       checkAuthenticated, searchPage);
router.get('/search', checkAuthenticated, searchUsers);

module.exports = router;