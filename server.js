// backend/server.js
const express = require("express");
const cors = require("cors");
const db = require("./db");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const SALT_ROUNDS = 10;

// ---------------------------------------------------------------------
// USUÁRIOS BÁSICO (lista e cria usuário) – SEM DUPLICAR SERVIDOR
// ---------------------------------------------------------------------

// Lista todos os usuários
app.get("/api/usuarios", (req, res) => {
    db.all("SELECT * FROM usuarios", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Cria usuário (ex: cadastro via painel admin) – já grava senha com hash
app.post("/api/usuarios", async (req, res) => {
    try {
        const { username, senha, email, admin, role } = req.body;

        if (!username || !senha) {
            return res.status(400).json({ error: "Informe usuário e senha." });
        }

        const hash = await bcrypt.hash(senha, SALT_ROUNDS);

        db.run(
            `INSERT INTO usuarios (username, senha, email, admin, role)
             VALUES (?, ?, ?, ?, ?)`,
            [username, hash, email || "", admin ? 1 : 0, role || (admin ? "admin" : "cliente")],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            }
        );
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro no servidor." });
    }
});

// ---------------------------------------------------------------------
// LOGS
// ---------------------------------------------------------------------

app.post("/api/logs", (req, res) => {
    const { dataHora, usuario, acao, detalhes } = req.body;
    db.run(
        `INSERT INTO logs (dataHora, usuario, acao, detalhes)
         VALUES (?, ?, ?, ?)`,
        [dataHora, usuario, acao, detalhes],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.get("/api/logs", (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ---------------------------------------------------------------------
// AUTENTICAÇÃO (REGISTRO / LOGIN / LEMBRAR CONTA)
// ---------------------------------------------------------------------

// REGISTRO
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, email, senha } = req.body;

        if (!username || !email || !senha) {
            return res.status(400).json({ error: "Preencha usuário, e-mail e senha." });
        }

        // verifica se já existe usuário
        db.get(
            "SELECT id FROM usuarios WHERE username = ?",
            [username],
            async (err, row) => {
                if (err) return res.status(500).json({ error: err.message });

                if (row) {
                    return res.status(400).json({ error: "Usuário já existe." });
                }

                const hash = await bcrypt.hash(senha, SALT_ROUNDS);

                db.run(
                    `INSERT INTO usuarios (username, senha, email, admin, role)
                     VALUES (?, ?, ?, ?, ?)`,
                    [username, hash, email, 0, "cliente"],
                    function (err2) {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json({
                            id: this.lastID,
                            username,
                            email,
                            admin: 0,
                            role: "cliente"
                        });
                    }
                );
            }
        );
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro no servidor." });
    }
});

// LOGIN
app.post("/api/auth/login", (req, res) => {
    const { username, senha } = req.body;

    if (!username || !senha) {
        return res.status(400).json({ error: "Informe usuário e senha." });
    }

    db.get(
        "SELECT * FROM usuarios WHERE username = ?",
        [username],
        async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(400).json({ error: "Usuário não encontrado." });

            const ok = await bcrypt.compare(senha, user.senha);
            if (!ok) return res.status(400).json({ error: "Senha incorreta." });

            res.json({
                id: user.id,
                username: user.username,
                email: user.email,
                admin: !!user.admin,
                role: user.role || (user.admin ? "admin" : "cliente")
            });
        }
    );
});

// BUSCAR USUÁRIO POR ID (para "lembrar conta")
app.get("/api/auth/me/:id", (req, res) => {
    const id = req.params.id;

    db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            admin: !!user.admin,
            role: user.role || (user.admin ? "admin" : "cliente")
        });
    });
});

// ---------------------------------------------------------------------
// INICIAR SERVIDOR – APENAS UMA VEZ!
// ---------------------------------------------------------------------
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend rodando em http://localhost:${PORT}`);
});
