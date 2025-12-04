// backend/db.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// garante que a pasta ../db existe
const dbDir = path.join(__dirname, "..", "db");
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// caminho para o arquivo .db
const dbPath = path.join(dbDir, "sistemaCaixaLoja.db");

// abre (ou cria) o arquivo .db
const db = new sqlite3.Database(dbPath);

// cria tabelas básicas se não existirem
db.serialize(() => {
    // ------------------------
    // USUÁRIOS
    // ------------------------
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

    // ------------------------
    // PRODUTOS
    // ------------------------
    // Obs.: nomes de coluna alinhados com o server.js:
    // preco_base, desconto_percent, etc.
    db.run(`
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT,
            nome TEXT,
            preco_base REAL,
            desconto_percent REAL,
            estoque INTEGER DEFAULT 0,
            imagem TEXT,
            imagens TEXT    -- JSON com lista de URLs/base64, se quiser
        )
    `);

    // ------------------------
    // VENDAS
    // ------------------------
    // Campos mais completos pra combinar com o que você já usa no front:
    // subtotal, descontoCupom, origem (loja/caixa), formaPagamento, status etc.
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataHora TEXT,
            itens TEXT,           -- JSON dos itens da venda
            subtotal REAL,
            descontoCupom REAL,
            total REAL,
            origem TEXT,          -- 'loja' ou 'caixa'
            formaPagamento TEXT,  -- dinheiro, cartão, etc.
            status TEXT,          -- 'ativa' ou 'cancelada'
            usuario TEXT,         -- username de quem fez a venda
            cupomCodigo TEXT      -- código do cupom aplicado (se houver)
        )
    `);

    // ------------------------
    // LOGS
    // ------------------------
    db.run(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dataHora TEXT,
            usuario TEXT,
            acao TEXT,
            detalhes TEXT
        )
    `);

    // ------------------------
    // CUPONS (opcional, já deixando no esquema)
    // ------------------------
    db.run(`
        CREATE TABLE IF NOT EXISTS cupons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE,
            descontoPercent REAL,
            ativo INTEGER DEFAULT 1,
            criadoPor TEXT,
            criadoEm TEXT
        )
    `);

    // ------------------------
    // Usuário padrão (admin principal)
    // ------------------------
    db.get(
        "SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?)",
        ["hilariu"],
        (err, row) => {
            if (err) {
                console.error("Erro ao verificar usuário padrão:", err);
                return;
            }
            if (!row) {
                db.run(
                    `
                    INSERT INTO usuarios (username, senha, email, admin, role)
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    ["hilariu", "123", "admin@exemplo.com", 1, "admin"],
                    (err2) => {
                        if (err2) {
                            console.error("Erro ao criar usuário padrão:", err2);
                        } else {
                            console.log('Usuário admin padrão "hilariu" criado com senha "123".');
                        }
                    }
                );
            }
        }
    );
});

module.exports = db;
