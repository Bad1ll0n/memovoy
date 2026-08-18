const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { getProfile, updateProfile } = require('../controllers/profileController');
const { checkAuthenticated } = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload  = multer({ storage });

const profileUpload = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'cover',  maxCount: 1 }
]);

router.get('/',     checkAuthenticated, getProfile);
router.get('/edit', checkAuthenticated, (req, res) => res.render("profile_edit", { user: req.user }));
router.post('/edit', checkAuthenticated, profileUpload, updateProfile);

module.exports = router;