const express = require("express");
const cors = require("cors");
const passport = require("passport");
const session = require("express-session");
const flash = require("express-flash");
const helmet = require("helmet");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// --- CONFIGURAÇÕES E MIDDLEWARES ---
app.set("view engine", "ejs");
app.use(cors());
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Sessão (Deve vir ANTES do passport)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
});
app.use(sessionMiddleware);

// Passport
const initializePassport = require("./config/passportConfig");
initializePassport(passport);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Middleware para disponibilizar variáveis globais nas views
app.use(async (req, res, next) => {
    res.locals.success_msg  = req.flash('success_msg');
    res.locals.error_msg    = req.flash('error_msg');
    res.locals.error        = req.flash('error');
    res.locals.user         = req.user || null;
    res.locals.unreadMessages      = 0;
    res.locals.unreadNotifications = 0;
    if (req.user) {
        try {
            res.locals.unreadMessages      = await messagesRepo.countUnread(req.user.Guid);
            res.locals.unreadNotifications = await notifRepo.countUnread(req.user.Guid);
        } catch(e) { /* silencioso */ }
    }
    next();
});

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                "default-src": ["'self'"],
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    "https://cdn.jsdelivr.net",
                    "https://kit.fontawesome.com",
                    "https://unpkg.com"
                ],
                "script-src-attr": ["'unsafe-inline'"],
                "style-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdn.jsdelivr.net",
                    "https://cdnjs.cloudflare.com",
                    "https://fonts.googleapis.com",
                    "https://ka-f.fontawesome.com",
                    "https://unpkg.com"
                ],
                "img-src": [
                    "'self'",
                    "data:",
                    "blob:",
                    "https://images.unsplash.com",
                    "https://i.pravatar.cc",
                    "https://*",
                    "https://*.tile.openstreetmap.org"
                ],
                "font-src": ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com", "data:"],
                "connect-src": [
                    "'self'",
                    "https://ka-f.fontawesome.com",
                    "https://unpkg.com",
                    "http://localhost:3000",
                    "ws://localhost:3000",
                    "https://nominatim.openstreetmap.org"
                ],
            },
        },
    })
);

// --- i18n ---
const { i18next, middleware: i18nMiddleware } = require('./config/i18n');
app.use(i18nMiddleware.handle(i18next));

// --- ROTAS ---
const authRoutes      = require('./routes/auth');
const { checkAuthenticated } = require('./middleware/auth');
const itineraryRoutes = require('./routes/itinerary');
const manualRoutes    = require('./routes/manualItineraryRoutes');
const tripRoutes      = require('./routes/trips');
const postRoutes      = require('./routes/posts');
const feedRoutes      = require('./routes/feed');
const profileRoutes   = require('./routes/profile');
const favoritesRoutes = require('./routes/favorites');
const followRoutes    = require('./routes/follows');
const followsCtrl     = require('./controllers/followsController');
const usersRoutes     = require('./routes/users');
const messagesRoutes  = require('./routes/messages');
const messagesRepo    = require('./db/messagesRepository');
const notifRepo       = require('./db/notificationsRepository');
const notifRoutes     = require('./routes/notifications');

app.use('/users',         authRoutes);
app.use('/',              tripRoutes);
app.use('/',              postRoutes);
app.use('/dashboard',     feedRoutes);
app.use('/profile',       profileRoutes);
app.use('/',              favoritesRoutes);
app.use('/itinerary',     itineraryRoutes);
app.use('/manualRoteiro', manualRoutes);
app.use('/follow',        followRoutes);
app.get('/u/:userId',     checkAuthenticated, followsCtrl.getPublicProfile);
app.use('/users',         usersRoutes);
app.use('/messages',      messagesRoutes);
app.use('/notifications', notifRoutes);

app.get("/logout", (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect("/");
    });
});

app.get("/", (req, res) => res.render("index", { message: req.query.message }));
app.get("/settings", checkAuthenticated, (req, res) => res.render("settings"));
app.get("/settings/language/:lang", checkAuthenticated, (req, res) => {
    const lang = ['pt', 'en'].includes(req.params.lang) ? req.params.lang : 'pt';
    res.cookie('insight-lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
    res.redirect('/settings');
});

const countriesAndCities = require('./data/countries.js');
app.get('/search', (req, res) => {
    try {
        const query = req.query.q ? req.query.q.toLowerCase() : "";
        if (!query) return res.json([]);
        let results = [];
        countriesAndCities.forEach(item => {
            item.cities.forEach(city => {
                if (city.toLowerCase().includes(query)) {
                    results.push({ name: city, country: item.country, type: "city" });
                }
            });
        });
        res.json(results.slice(0, 10));
    } catch (error) {
        console.error("Erro na pesquisa:", error);
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

// --- SOCKET.IO ---
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
    passport.initialize()(socket.request, {}, () => {
        passport.session()(socket.request, {}, next);
    });
});

// Exporta o io para uso nos controllers
global._io = io;

io.on('connection', (socket) => {
    const user = socket.request.user;
    if (!user) return socket.disconnect();

    const userId = user.Guid;
    socket.join('user:' + userId);

    socket.on('join_conversation', (convId) => {
        if (convId) socket.join('conv:' + convId);
    });

    socket.on('send_message', async (data) => {
        try {
            const { conversationId, content } = data;
            if (!content || !content.trim() || !conversationId) return;
            const msg = await messagesRepo.saveMessage(conversationId, userId, content.trim());

            // Emite a mensagem para todos na conversa
            io.to('conv:' + conversationId).emit('new_message', {
                id:         msg.id,
                sender_id:  msg.sender_id,
                content:    msg.content,
                created_at: msg.created_at,
            });

            // Notifica o destinatário com o novo count de não lidas
            const { pool } = require('./config/dbConfig');
            const conv = await pool.query(
                'SELECT user1_id, user2_id FROM public.conversations WHERE id = $1',
                [conversationId]
            );
            if (conv.rows.length > 0) {
                const recipientId = conv.rows[0].user1_id === userId
                    ? conv.rows[0].user2_id
                    : conv.rows[0].user1_id;
                const unread = await messagesRepo.countUnread(recipientId);
                io.to('user:' + recipientId).emit('unread_messages', { count: unread });
            }
        } catch (err) {
            console.error('Socket send_message error:', err);
        }
    });

    socket.on('mark_read', async (convId) => {
        try {
            if (convId) await messagesRepo.markAsRead(convId, userId);
        } catch(err) { console.error(err); }
    });
});

// Middleware 404
app.use((req, res) => res.status(404).render("404"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));