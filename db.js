// backend/db.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// garante que a pasta ../db existe
const dbDir = path.join(__dirname, "..", "db");
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir);
}

// caminho para o arquivo .db
const dbPath = path.join(dbDir, "sistemaCaixaLoja.db");

// abre (ou cria) o arquivo .db
const db = new sqlite3.Database(dbPath);

// cria tabelas básicas se não existirem
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            senha TEXT,
            email TEXT,
            admin INTEGER DEFAULT 0,
            role TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT,
            nome TEXT,
            precoBase REAL,
            descontoPercent REAL,
            estoque INTEGER,
            imagem TEXT,
            imagens TEXT   -- você pode salvar JSON aqui
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataHora TEXT,
            itens TEXT,       -- JSON dos itens
            total REAL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataHora TEXT,
            usuario TEXT,
            acao TEXT,
            detalhes TEXT
        )
    `);

    // cria usuário padrão se não existir
    db.get(
        "SELECT * FROM usuarios WHERE username = ?",
        ["hilariu"],
        (err, row) => {
            if (err) {
                console.error("Erro ao verificar usuário padrão:", err);
                return;
            }
            if (!row) {
                db.run(
                    `INSERT INTO usuarios (username, senha, email, admin, role)
                     VALUES (?, ?, ?, ?, ?)`,
                    ["hilariu", "123", "admin@exemplo.com", 1, "admin"]
                );
            }
        }
    );
});

module.exports = db;
