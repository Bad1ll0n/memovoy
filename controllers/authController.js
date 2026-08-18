const { pool } = require("../config/dbConfig"); // Confirma se o caminho para dbConfig está correto
const bcrypt = require("bcrypt");

const registerUser = async (req, res) => {
    let { firstName, lastName, fullName, username, location, email, password, password2 } = req.body;
    let errors = [];

    if (!firstName || !lastName || !fullName || !username || !location || !email || !password || !password2) {
        errors.push({ message: "Please enter all fields" });
    }

    if (password.length < 6) {
        errors.push({ message: "Password must be a least 6 characters long" });
    }

    if (password !== password2) {
        errors.push({ message: "Passwords do not match" });
    }
    if (errors.length > 0) {
        res.render("register", { errors, firstName, lastName, fullName, username, location, email, password, password2 });
    } else {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            // Verifica se o utilizador existe
            const userCheck = await pool.query(`SELECT * FROM public."Users" WHERE "Email" = $1`, [email]);

            if (userCheck.rows.length > 0) {
                return res.render("register", {
                    errors: [{ message: "Este email já está registado" }]
                });

            } else {
                // Insere novo utilizador
                await pool.query(
                    `INSERT INTO public."Users" ("First_Name", "Last_Name", "Email", "Password", "Name", "Username", "Location")
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     RETURNING "Guid", "Password"`,
                    [firstName, lastName, email, hashedPassword, fullName, username, location]
                );
                
                req.flash("success_msg", "You are now registered. Please log in");
                res.redirect("/users/login");
            }
        } catch (err) {
            console.error(err);
            res.render("register", { errors: [{ message: "Erro ao registar utilizador. Tenta novamente." }] });
        }
    }
};

module.exports = { registerUser };