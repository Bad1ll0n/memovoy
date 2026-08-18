const express = require("express");
const router = express.Router();
const passport = require("passport");
const { registerUser } = require("../controllers/authController");
const { checkAuthenticated, checkNotAuthenticated } = require("../middleware/auth");

// --- GET Routes ---

// Login Page
router.get("/login", checkNotAuthenticated, (req, res) => {
    res.render("login.ejs");
});

// Register Page
router.get("/register", checkNotAuthenticated, (req, res) => {
    res.render("register.ejs");
});

// Logout
router.get("/logout", (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect("/?message=You have logged out successfully");
    });
});

// --- POST Routes ---

// Register Logic
router.post("/register", registerUser);

// Login Logic (Passport)
router.post("/login", passport.authenticate("local", {
    successRedirect: "/dashboard",
    failureRedirect: "/users/login",
    failureFlash: true
}));

module.exports = router;