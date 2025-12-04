const express = require("express");
const cors = require("cors");
const db = require("./db"); // arquivo que exporta a instância do sqlite3.Database

const app = express();

// Middlewares básicos
app.use(cors());
app.use(express.json());

/*
Se você quiser servir a pasta do frontend pelo mesmo servidor, pode usar algo assim:
app.use(express.static("../public")); // ajuste o caminho conforme sua estrutura
*/

// -------------------------
// USUÁRIOS
// -------------------------

// Lista todos os usuários
app.get("/api/usuarios", (req, res) => {
    db.all("SELECT * FROM usuarios", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Busca usuário por ID
app.get("/api/usuarios/:id", (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM usuarios WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Usuário não encontrado" });
        res.json(row);
    });
});

// Cria novo usuário
app.post("/api/usuarios", (req, res) => {
    const { username, senha, email, admin = 0, role = "cliente" } = req.body;

    if (!username || !senha || !email) {
        return res.status(400).json({ error: "username, senha e email são obrigatórios" });
    }

    const sql = `
        INSERT INTO usuarios (username, senha, email, admin, role)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [username, senha, email, admin ? 1 : 0, role],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID });
        }
    );
});

// Atualiza usuário
app.put("/api/usuarios/:id", (req, res) => {
    const { id } = req.params;
    const { username, senha, email, admin = 0, role = "cliente" } = req.body;

    const sql = `
        UPDATE usuarios
        SET username = ?, senha = ?, email = ?, admin = ?, role = ?
        WHERE id = ?
    `;

    db.run(
        sql,
        [username, senha, email, admin ? 1 : 0, role, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: "Usuário não encontrado" });
            }
            res.json({ ok: true });
        }
    );
});

// Remove usuário
app.delete("/api/usuarios/:id", (req, res) => {
    const { id } = req.params;

    // opcional: impedir excluir o admin principal "hilariu"
    db.get("SELECT username FROM usuarios WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Usuário não encontrado" });

        if (row.username && row.username.toLowerCase() === "hilariu") {
            return res.status(400).json({ error: 'Usuário "hilariu" não pode ser excluído.' });
        }

        db.run("DELETE FROM usuarios WHERE id = ?", [id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: "Usuário não encontrado" });
            }
            res.json({ ok: true });
        });
    });
});

// (Opcional) Rota de login via backend
app.post("/api/login", (req, res) => {
    const { username, senha } = req.body;

    if (!username || !senha) {
        return res.status(400).json({ error: "Informe username e senha" });
    }

    const sql = `
        SELECT * FROM usuarios
        WHERE LOWER(username) = LOWER(?) AND senha = ?
    `;

    db.get(sql, [username, senha], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Usuário ou senha inválidos" });

        // Aqui você poderia gerar token JWT, etc. Por enquanto devolve o usuário.
        res.json(row);
    });
});

// -------------------------
// PRODUTOS
// -------------------------

// Lista todos os produtos
app.get("/api/produtos", (req, res) => {
    db.all("SELECT * FROM produtos", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Busca produto por ID
app.get("/api/produtos/:id", (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM produtos WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Produto não encontrado" });
        res.json(row);
    });
});

// Cria novo produto
app.post("/api/produtos", (req, res) => {
    const {
        codigo,
        nome,
        preco_base,
        desconto_percent = 0,
        estoque = 0,
        imagem
    } = req.body;

    if (!nome || typeof preco_base === "undefined") {
        return res.status(400).json({ error: "nome e preco_base são obrigatórios" });
    }

    const sql = `
        INSERT INTO produtos (codigo, nome, preco_base, desconto_percent, estoque, imagem)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
        sql,
        [codigo || null, nome, preco_base, desconto_percent, estoque, imagem || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: this.lastID });
        }
    );
});

// Atualiza produto
app.put("/api/produtos/:id", (req, res) => {
    const { id } = req.params;
    const {
        codigo,
        nome,
        preco_base,
        desconto_percent = 0,
        estoque = 0,
        imagem
    } = req.body;

    const sql = `
        UPDATE produtos
        SET codigo = ?, nome = ?, preco_base = ?, desconto_percent = ?, estoque = ?, imagem = ?
        WHERE id = ?
    `;

    db.run(
        sql,
        [codigo || null, nome, preco_base, desconto_percent, estoque, imagem || null, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: "Produto não encontrado" });
            }
            res.json({ ok: true });
        }
    );
});

// Remove produto
app.delete("/api/produtos/:id", (req, res) => {
    const { id } = req.params;
    db.run(
        "DELETE FROM produtos WHERE id = ?",
        [id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: "Produto não encontrado" });
            }
            res.json({ ok: true });
        }
    );
});

// -------------------------
// INICIAR SERVIDOR
// -------------------------
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log("Servidor backend rodando na porta", PORT);
});