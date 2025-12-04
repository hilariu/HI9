// ------------------------
// Chaves de armazenamento
// ------------------------
const DB_KEY = "sistemaCaixaLojaDB_v4_com_descontos_cupons_logs";
const REMEMBER_KEY = "sistemaCaixaLojaRememberUserId";

// ------------------------
// Estado global (dados principais)
// ------------------------
let usuarios = [];
let produtos = [];
let vendas = [];
let caixas = [];
let entradas = [];
let saidas = [];
let cupons = [];
let logs = [];

// Próximos IDs
let proximoIdUsuario = 1;
let proximoIdProduto = 1;
let proximoIdVenda = 1;

// Estado de sessão / interface
let currentUser = { id: null, role: "visitante", nome: "Visitante", username: null, email: null };
let carrinhoLoja = [];
let carrinhoCaixa = [];
let cupomLojaAtual = null;
let cupomCaixaAtual = null;
let produtoDetalheAtualId = null;

// Filtros de busca
let filtroEstoque = "";
let filtroProdutosCadastro = "";

// ------------------------
// Funções utilitárias
// ------------------------

// Data de hoje em formato YYYY-MM-DD
function hojeStr() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

// Formata data YYYY-MM-DD para DD/MM/YYYY
function formatarDataBrasileira(dataStr) {
    if (!dataStr || typeof dataStr !== "string") return dataStr || "";
    const [ano, mes, dia] = dataStr.split("-");
    if (!ano || !mes || !dia) return dataStr;
    return `${dia}/${mes}/${ano}`;
}

// Formata número para moeda brasileira
function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// Calcula o preço de venda de um produto (preço base - desconto%)
function getPrecoVenda(produto) {
    if (!produto) return 0;
    // suporte tanto a precoBase (front) quanto preco_base (caso venha do backend)
    const base = Number(
        typeof produto.precoBase !== "undefined"
            ? produto.precoBase
            : produto.preco_base || 0
    ) || 0;

    const descontoPercent = Number(produto.descontoPercent || 0) || 0;
    const fator = 1 - descontoPercent / 100;
    return base * fator;
}

// Registra log de ação
function logAcao(acao, detalhes) {
    const log = {
        dataHora: new Date().toISOString(),
        usuario: currentUser && currentUser.username ? currentUser.username : null,
        acao,
        detalhes: detalhes || null
    };
    logs.push(log);
    salvarDB();
}

// ------------------------
// Persistência em localStorage
// ------------------------
function salvarDB() {
    const db = {
        usuarios,
        produtos,
        vendas,
        caixas,
        entradas,
        saidas,
        cupons,
        logs,
        proximoIdUsuario,
        proximoIdProduto,
        proximoIdVenda
    };

    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
        console.error("Erro ao salvar DB no localStorage:", e);
    }
}

function carregarDB() {
    const json = localStorage.getItem(DB_KEY);

    if (!json) {
        // Banco ainda não existe -> cria estrutura inicial
        inicializarDBPadrao();
        salvarDB();
        return;
    }

    try {
        const db = JSON.parse(json) || {};

        usuarios = Array.isArray(db.usuarios) ? db.usuarios : [];
        produtos = Array.isArray(db.produtos) ? db.produtos : [];
        vendas   = Array.isArray(db.vendas)   ? db.vendas   : [];
        caixas   = Array.isArray(db.caixas)   ? db.caixas   : [];
        entradas = Array.isArray(db.entradas) ? db.entradas : [];
        saidas   = Array.isArray(db.saidas)   ? db.saidas   : [];
        cupons   = Array.isArray(db.cupons)   ? db.cupons   : [];
        logs     = Array.isArray(db.logs)     ? db.logs     : [];

        proximoIdUsuario = typeof db.proximoIdUsuario === "number"
            ? db.proximoIdUsuario
            : (usuarios.length ? Math.max(...usuarios.map(u => u.id || 0)) + 1 : 1);

        proximoIdProduto = typeof db.proximoIdProduto === "number"
            ? db.proximoIdProduto
            : (produtos.length ? Math.max(...produtos.map(p => p.id || 0)) + 1 : 1);

        proximoIdVenda = typeof db.proximoIdVenda === "number"
            ? db.proximoIdVenda
            : (vendas.length ? Math.max(...vendas.map(v => v.id || 0)) + 1 : 1);

        // Garante que exista o admin principal "hilariu"
        garantirAdminPrincipal();

    } catch (e) {
        console.error("Erro ao carregar DB do localStorage, recriando do zero:", e);
        inicializarDBPadrao();
        salvarDB();
    }
}

// Cria uma base inicial com admin principal
function inicializarDBPadrao() {
    usuarios = [];
    produtos = [];
    vendas = [];
    caixas = [];
    entradas = [];
    saidas = [];
    cupons = [];
    logs = [];

    proximoIdUsuario = 1;
    proximoIdProduto = 1;
    proximoIdVenda = 1;

    // Cria admin principal "hilariu"
    const adminHilariu = {
        id: proximoIdUsuario++,
        username: "hilariu",
        senha: "",          // se quiser, troque por uma senha, ex: "1234"
        email: "",
        admin: true,
        role: "admin"
    };
    usuarios.push(adminHilariu);

    logAcao("init_db", "Banco inicializado com admin principal 'hilariu'.");
}

// Garante que exista sempre um usuário "hilariu" admin
function garantirAdminPrincipal() {
    const existe = usuarios.find(u => u.username && u.username.toLowerCase() === "hilariu");
    if (!existe) {
        const adminHilariu = {
            id: proximoIdUsuario++,
            username: "hilariu",
            senha: "",      // ajuste se quiser uma senha específica
            email: "",
            admin: true,
            role: "admin"
        };
        usuarios.push(adminHilariu);
        logAcao("criar_admin_principal", "Admin principal 'hilariu' recriado.");
        salvarDB();
    }
}

// Só pra debug opcional no console
window.__dumpDB = function () {
    console.log({
        usuarios,
        produtos,
        vendas,
        caixas,
        entradas,
        saidas,
        cupons,
        logs,
        proximoIdUsuario,
        proximoIdProduto,
        proximoIdVenda
    });
    alert("Estado atual do DB foi exibido no console.");
};
