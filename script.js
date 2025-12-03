// CHAVE DO 'BANCO DE DADOS'
const DB_KEY = "sistemaCaixaLojaDB_v4_com_descontos_cupons_logs";
const REMEMBER_KEY = "sistemaCaixaLojaRememberUserId";

let db;
let usuarios;
let produtos;
let vendas;
let caixas;
let entradas;
let saidas;
let cupons;
let logs;
let proximoIdProduto;
let proximoIdVenda;
let proximoIdUsuario;

let carrinhoCaixa = [];
let carrinhoLoja = [];
let editingProdutoId = null;
let produtoDetalheAtualId = null;

let currentUser = { id: null, role: "visitante", nome: "Visitante", username: null, email: null };

let filtroEstoque = "";
let filtroProdutosCadastro = "";

let cupomLojaAtual = null;
let cupomCaixaAtual = null;

// ------------------------
// Utilitários
// ------------------------
const formatarMoeda = (valor) => "R$ " + Number(valor || 0).toFixed(2).replace(".", ",");

const dataAtualExtenso = () => {
    const hoje = new Date();
    return hoje.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const hojeStr = () => {
    const d = new Date();
    return d.toISOString().slice(0,10);
};

const formatarDataBrasileira = (dateStr) => {
    const [ano, mes, dia] = dateStr.split("-");
    return `${dia}/${mes}/${ano}`;
};

document.getElementById("dateSpan").textContent = dataAtualExtenso();

// preço com desconto
function getPrecoVenda(produto) {
    const base = produto.precoBase != null ? produto.precoBase : (produto.preco || 0);
    const desc = produto.descontoPercent || 0;
    const valor = base * (1 - desc / 100);
    return valor >= 0 ? valor : 0;
}

// logs
function logAcao(acao, detalhes) {
    const registro = {
        dataHora: new Date().toISOString(),
        usuario: currentUser.username || "visitante",
        acao,
        detalhes
    };
    logs.push(registro);
    salvarDB();
    renderLogsAdmin();
}

// ------------------------
// "Database" localStorage
// ------------------------
function criarDBPadrao() {
    return {
        usuarios: [
            { id: 1, username: "hilariu", senha: "123", email: "admin@exemplo.com", admin: true, role: "admin" }
        ],
        proximoIdUsuario: 2,
        produtos: [
            {
                id: 1,
                codigo: "HANNYA01",
                nome: "Camiseta Hannya",
                precoBase: 100.00,
                descontoPercent: 0,
                estoque: 100,
                imagem: "https://via.placeholder.com/200x160?text=Hannya",
                imagens: ["https://via.placeholder.com/400x300?text=Hannya+1"]
            }
        ],
        vendas: [],
        proximoIdProduto: 2,
        proximoIdVenda: 1,
        caixas: [],
        entradas: [],
        saidas: [],
        cupons: [],
        logs: []
    };
}

function carregarDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
        try {
            db = JSON.parse(raw);
        } catch (e) {
            db = criarDBPadrao();
        }
    } else {
        db = criarDBPadrao();
    }

    usuarios = db.usuarios || [];
    produtos = db.produtos || [];
    vendas   = db.vendas   || [];
    caixas   = db.caixas   || [];
    entradas = db.entradas || [];
    saidas   = Array.isArray(db.saidas) ? db.saidas : []; // ✅ AQUI
    cupons   = db.cupons   || [];
    logs     = db.logs     || [];

    db.caixas   = caixas;
    db.entradas = entradas;
    db.saidas   = saidas;
    db.cupons   = cupons;
    db.logs     = logs;

    usuarios.forEach(u => {
        if (!("email" in u)) u.email = "";
        if (!u.role) {
            u.role = u.admin ? "admin" : "cliente";
        }
        if (u.username && u.username.toLowerCase() === "hilariu") {
            u.role = "admin";
            u.admin = true;
        }
    });

    produtos.forEach(p => {
        if (p.precoBase == null) {
            p.precoBase = p.preco || 0;
        }
        if (p.descontoPercent == null) p.descontoPercent = 0;
        if (!Array.isArray(p.imagens)) {
            const imgs = [];
            if (p.imagem) imgs.push(p.imagem);
            p.imagens = imgs;
        }
    });

    proximoIdProduto = db.proximoIdProduto || (produtos.length ? Math.max(...produtos.map(p => p.id)) + 1 : 1);
    proximoIdVenda = db.proximoIdVenda || 1;
    proximoIdUsuario = db.proximoIdUsuario || (usuarios.length ? Math.max(...usuarios.map(u => u.id)) + 1 : 1);
}

function salvarDB() {
    db.usuarios = usuarios;
    db.produtos = produtos;
    db.vendas = vendas;
    db.caixas = caixas;
    db.entradas = entradas;
    db.saidas = saidas;
    db.cupons = cupons;
    db.logs = logs;
    db.proximoIdProduto = proximoIdProduto;
    db.proximoIdVenda = proximoIdVenda;
    db.proximoIdUsuario = proximoIdUsuario;
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ------------------------
// Caixa diário automático
// ------------------------
function obterCaixaHoje(criarSeNao) {
    const data = hojeStr();
    let c = caixas.find(x => x.data === data);
    if (!c && criarSeNao) {
        c = {
            data,
            aberto: true,
            saldoInicial: 0,
            saldoFinal: null,
            horaAbertura: new Date().toISOString(),
            horaFechamento: null
        };
        caixas.push(c);
    }
    return c;
}

function fecharCaixasAntigos() {
    const hoje = hojeStr();
    caixas.forEach(c => {
        if (c.data < hoje && c.aberto) {
            const vendasDia = vendas.filter(v => v.status === "ativa" && v.dataHora.slice(0,10) === c.data);
            const totalDia = vendasDia.reduce((s, v) => s + v.total, 0);
            c.aberto = false;
            c.horaFechamento = new Date().toISOString();
            c.saldoFinal = (c.saldoInicial || 0) + totalDia;
        }
    });
}

function garantirCaixaDeHoje() {
    const c = obterCaixaHoje(true);
    if (!c.aberto) {
        c.aberto = true;
        c.saldoInicial = c.saldoInicial || 0;
        c.horaAbertura = new Date().toISOString();
        c.saldoFinal = null;
        c.horaFechamento = null;
    }
}

document.querySelectorAll(".submenu-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-submenu");
        const submenu = document.getElementById(id);

        const isOpen = submenu.classList.contains("open");

        // Fecha todos os submenus
        document.querySelectorAll(".submenu").forEach(sm => sm.classList.remove("open"));
        document.querySelectorAll(".submenu-toggle").forEach(b => b.classList.remove("open"));

        // Abre apenas o clicado
        if (!isOpen) {
            submenu.classList.add("open");
            btn.classList.add("open");
        }
    });
});

// ------------------------
// Navegação e visibilidade
// ------------------------
const secoes = document.querySelectorAll(".section");
const botoesMenu = document.querySelectorAll(".menu-btn");

function mostrarSecao(id) {
    secoes.forEach(sec => {
        sec.classList.toggle("active", sec.id === id);
    });
    botoesMenu.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.section === id);
    });
}

botoesMenu.forEach(btn => {
    btn.addEventListener("click", () => {
        const alvo = btn.dataset.section;
        mostrarSecao(alvo);
    });
});

function atualizarVisibilidadePorRole() {
    const role = currentUser.role || "visitante";

    // Elementos com data-roles
    document.querySelectorAll("[data-roles]").forEach(el => {
        const roles = (el.getAttribute("data-roles") || "").split(",").map(r => r.trim()).filter(Boolean);
        const permitido = roles.includes(role);
        el.style.display = permitido ? "" : "none";
    });

    // Aba carrinho: apenas visitante e cliente
    document.querySelectorAll('[data-section="carrinho"]').forEach(el => {
        if (role === "cliente" || role === "visitante") {
            el.style.display = "";
        } else {
            el.style.display = "none";
        }
    });

    // Painel de criação de cupom: só admin
    const painelCriarCupom = document.getElementById("painelCriarCupom");
    if (painelCriarCupom) {
        painelCriarCupom.style.display = role === "admin" ? "" : "none";
    }

    // Se a seção ativa não é mais permitida, volta para loja ou caixa
    const secaoAtiva = Array.from(secoes).find(sec => sec.classList.contains("active"));
    if (secaoAtiva && secaoAtiva.hasAttribute("data-roles")) {
        const roles = (secaoAtiva.getAttribute("data-roles") || "").split(",").map(r => r.trim());
        if (!roles.includes(role)) {
            if (role === "admin" || role === "gerente" || role === "vendedor" || role === "estoquista") {
                mostrarSecao("caixa");
            } else {
                mostrarSecao("loja");
            }
        }
    }
}

function setUserFromObj(user) {
    if (!user) {
        currentUser = { id: null, role: "visitante", nome: "Visitante", username: null, email: null };
    } else {
        const role = user.role || (user.admin ? "admin" : "cliente");
        currentUser = {
            id: user.id,
            role,
            nome: user.username,
            username: user.username,
            email: user.email || ""
        };
    }

    const label = document.getElementById("userLabel");
    const btnLogout = document.getElementById("btnLogout");
    const btnLoginHeader = document.getElementById("btnLoginHeader");

    if (!user) {
        label.textContent = "Visitante";
        btnLogout.style.display = "none";
        btnLoginHeader.style.display = "inline-flex";
    } else {
        let prefixo = "";
        if (currentUser.username && currentUser.username.toLowerCase() === "hilariu") {
            prefixo = "Admin principal: ";
        } else {
            if (currentUser.role === "admin") prefixo = "Admin: ";
            else if (currentUser.role === "gerente") prefixo = "Gerente: ";
            else if (currentUser.role === "vendedor") prefixo = "Vendedor: ";
            else if (currentUser.role === "estoquista") prefixo = "Estoquista: ";
            else prefixo = "Cliente: ";
        }
        label.textContent = prefixo + currentUser.username;
        btnLogout.style.display = "inline-flex";
        btnLoginHeader.style.display = "none";
    }

    atualizarVisibilidadePorRole();
    renderPainelCaixa();
    renderRelatorioVendas();
    renderUsuariosAdmin();
    renderCupons();
}

// ------------------------
// LOGIN / REGISTRO / MODAL
// ------------------------
const loginModal = document.getElementById("loginModal");
const btnLoginHeader = document.getElementById("btnLoginHeader");
const btnFecharLogin = document.getElementById("btnFecharLogin");

function setLoginTab(tab) {
    const tabs = document.querySelectorAll(".login-tab");
    const loginArea = document.getElementById("loginArea");
    const registroArea = document.getElementById("registroArea");

    tabs.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    if (tab === "login") {
        loginArea.classList.add("active");
        registroArea.classList.remove("active");
    } else {
        loginArea.classList.remove("active");
        registroArea.classList.add("active");
    }

    document.getElementById("loginMensagem").textContent = "";
}

document.querySelectorAll(".login-tab").forEach(btn => {
    btn.addEventListener("click", () => {
        setLoginTab(btn.dataset.tab);
    });
});

btnLoginHeader.addEventListener("click", () => {
    document.getElementById("loginMensagem").textContent = "";
    setLoginTab("login");
    loginModal.style.display = "flex";
});

btnFecharLogin.addEventListener("click", () => {
    loginModal.style.display = "none";
});

loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) {
        loginModal.style.display = "none";
    }
});

document.getElementById("btnLogin").addEventListener("click", () => {
    const usuario = document.getElementById("loginUsuario").value.trim();
    const senha = document.getElementById("loginSenha").value.trim();
    const lembrar = document.getElementById("chkLembrarConta").checked;
    const msg = document.getElementById("loginMensagem");
    msg.textContent = "";

    if (!usuario || !senha) {
        msg.textContent = "Informe usuário e senha.";
        return;
    }

    const user = usuarios.find(
        u => u.username.toLowerCase() === usuario.toLowerCase() && u.senha === senha
    );
    if (!user) {
        msg.textContent = "Usuário ou senha inválidos.";
        return;
    }

    if (lembrar) {
        localStorage.setItem(REMEMBER_KEY, String(user.id));
    } else {
        localStorage.removeItem(REMEMBER_KEY);
    }

    setUserFromObj(user);
    msg.textContent = "Login realizado com sucesso!";
    loginModal.style.display = "none";
    logAcao("login", `Usuário ${user.username} realizou login.`);
});

document.getElementById("btnRegistrar").addEventListener("click", () => {
    const usuario = document.getElementById("registroUsuario").value.trim();
    const email = document.getElementById("registroEmail").value.trim();
    const senha = document.getElementById("registroSenha").value.trim();
    const msg = document.getElementById("loginMensagem");
    msg.textContent = "";

    if (!usuario || !senha || !email) {
        msg.textContent = "Preencha usuário, e-mail e senha para registrar.";
        setLoginTab("register");
        return;
    }

    if (usuario.toLowerCase() === "hilariu") {
        msg.textContent = "O usuário 'hilariu' é reservado para o admin principal.";
        setLoginTab("register");
        return;
    }

    const jaExiste = usuarios.some(u => u.username.toLowerCase() === usuario.toLowerCase());
    if (jaExiste) {
        msg.textContent = "Este usuário já existe.";
        setLoginTab("register");
        return;
    }

    const novoUsuario = {
        id: proximoIdUsuario++,
        username: usuario,
        senha: senha,
        email: email,
        admin: false,
        role: "cliente"
    };
    usuarios.push(novoUsuario);
    salvarDB();

    msg.textContent = "Usuário registrado com sucesso! Você já está logado.";
    localStorage.setItem(REMEMBER_KEY, String(novoUsuario.id));
    setUserFromObj(novoUsuario);
    loginModal.style.display = "none";

    logAcao("registro", `Novo usuário registrado: ${usuario}`);

    document.getElementById("registroUsuario").value = "";
    document.getElementById("registroEmail").value = "";
    document.getElementById("registroSenha").value = "";
});

document.getElementById("btnLogout").addEventListener("click", () => {
    logAcao("logout", `Usuário ${currentUser.username || "visitante"} saiu.`);
    localStorage.removeItem(REMEMBER_KEY);
    setUserFromObj(null);
    carrinhoCaixa = [];
    carrinhoLoja = [];
    cupomLojaAtual = null;
    cupomCaixaAtual = null;
    renderCarrinhoCaixa();
    renderCarrinhoLoja();
    atualizarTotaisCaixa();
    atualizarTotaisLoja();
    mostrarSecao("loja");
});

// ------------------------
// Renderizadores comuns
// ------------------------
function atualizarSelectProdutoCaixa() {
    const select = document.getElementById("selectProdutoCaixa");
    const selectEntrada = document.getElementById("selectProdutoEntrada");
    const selectDesconto = document.getElementById("selectProdutoDesconto");

    const popular = (el, textoVazio, formatFn) => {
        if (!el) return;
        el.innerHTML = "";
        if (produtos.length === 0) {
            const opt = document.createElement("option");
            opt.textContent = textoVazio;
            opt.disabled = true;
            opt.selected = true;
            el.appendChild(opt);
        } else {
            produtos.forEach(p => {
                const option = document.createElement("option");
                option.value = p.id;
                option.textContent = formatFn(p);
                el.appendChild(option);
            });
        }
    };

    popular(select, "Nenhum produto cadastrado", p => `${p.nome} (${formatarMoeda(getPrecoVenda(p))})`);
    popular(selectEntrada, "Nenhum produto cadastrado", p => `${p.codigo || ""} - ${p.nome} (Estoque: ${p.estoque})`);
    popular(selectDesconto, "Nenhum produto cadastrado", p => `${p.codigo || ""} - ${p.nome}`);
}

function renderCarrinhoCaixa() {
    const corpo = document.getElementById("tabelaCarrinhoCaixa");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (carrinhoCaixa.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "muted";
        td.textContent = "Nenhum item adicionado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
    } else {
        carrinhoCaixa.forEach((item, index) => {
            const tr = document.createElement("tr");

            const tdNome = document.createElement("td");
            tdNome.textContent = item.nome;
            tr.appendChild(tdNome);

            const tdQtd = document.createElement("td");
            tdQtd.textContent = item.qtd;
            tr.appendChild(tdQtd);

            const tdPreco = document.createElement("td");
            tdPreco.className = "right";
            tdPreco.textContent = formatarMoeda(item.precoUnit);
            tr.appendChild(tdPreco);

            const tdSub = document.createElement("td");
            tdSub.className = "right";
            tdSub.textContent = formatarMoeda(item.precoUnit * item.qtd);
            tr.appendChild(tdSub);

            const tdAcao = document.createElement("td");
            const btnRemover = document.createElement("button");
            btnRemover.textContent = "Remover";
            btnRemover.className = "btn secondary";
            btnRemover.style.fontSize = "11px";
            btnRemover.addEventListener("click", () => {
                carrinhoCaixa.splice(index, 1);
                renderCarrinhoCaixa();
                atualizarTotaisCaixa();
            });
            tdAcao.appendChild(btnRemover);
            tr.appendChild(tdAcao);

            corpo.appendChild(tr);
        });
    }

    const badge = document.getElementById("badgeItensCaixa");
    if (badge) {
        badge.textContent = carrinhoCaixa.length + " itens";
    }
}

function renderCarrinhoLoja() {
    const corpo = document.getElementById("tabelaCarrinhoLoja");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (carrinhoLoja.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "muted";
        td.textContent = "Carrinho vazio.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    carrinhoLoja.forEach((item, index) => {
        const tr = document.createElement("tr");

        const tdNome = document.createElement("td");
        tdNome.textContent = item.nome;
        tr.appendChild(tdNome);

        const tdQtd = document.createElement("td");
        tdQtd.textContent = item.qtd;
        tr.appendChild(tdQtd);

        const tdPreco = document.createElement("td");
        tdPreco.className = "right";
        tdPreco.textContent = formatarMoeda(item.precoUnit);
        tr.appendChild(tdPreco);

        const tdSub = document.createElement("td");
        tdSub.className = "right";
        tdSub.textContent = formatarMoeda(item.precoUnit * item.qtd);
        tr.appendChild(tdSub);

        const tdAcao = document.createElement("td");
        const btnRemover = document.createElement("button");
        btnRemover.textContent = "Remover";
        btnRemover.className = "btn secondary";
        btnRemover.style.fontSize = "11px";
        btnRemover.addEventListener("click", () => {
            carrinhoLoja.splice(index, 1);
            renderCarrinhoLoja();
            atualizarTotaisLoja();
        });
        tdAcao.appendChild(btnRemover);
        tr.appendChild(tdAcao);

        corpo.appendChild(tr);
    });
}

function calcularSubtotal(carrinho) {
    return carrinho.reduce((soma, item) => soma + item.precoUnit * item.qtd, 0);
}

function atualizarTotaisCaixa() {
    const subtotal = calcularSubtotal(carrinhoCaixa);
    const total = cupomCaixaAtual
        ? subtotal * (1 - (cupomCaixaAtual.descontoPercent / 100))
        : subtotal;
    const desconto = subtotal - total;

    const elSub = document.getElementById("subtotalCaixa");
    const elDesc = document.getElementById("descontoCaixa");
    const elTot = document.getElementById("totalCaixa");

    if (elSub) elSub.textContent = formatarMoeda(subtotal);
    if (elDesc) elDesc.textContent = formatarMoeda(desconto);
    if (elTot) elTot.textContent = formatarMoeda(total);

    const statusTxt = document.getElementById("statusCaixaCaixa");
    if (statusTxt) {
        statusTxt.textContent = "Caixa diário automático ativo. As vendas de hoje são registradas no caixa atual.";
    }
}

function atualizarTotaisLoja() {
    const subtotal = calcularSubtotal(carrinhoLoja);
    const total = cupomLojaAtual
        ? subtotal * (1 - (cupomLojaAtual.descontoPercent / 100))
        : subtotal;
    const desconto = subtotal - total;

    const elSub = document.getElementById("subtotalLoja");
    const elDesc = document.getElementById("descontoLoja");
    const elTot = document.getElementById("totalLoja");

    if (elSub) elSub.textContent = formatarMoeda(subtotal);
    if (elDesc) elDesc.textContent = formatarMoeda(desconto);
    if (elTot) elTot.textContent = formatarMoeda(total);
}

function renderTabelaEstoque() {
    const corpo = document.getElementById("tabelaEstoque");
    if (!corpo) return;
    corpo.innerHTML = "";

    const lista = produtos.filter(p => {
        if (!filtroEstoque) return true;
        const txt = (p.codigo || "" + " " + p.nome || "").toLowerCase();
        return txt.includes(filtroEstoque.toLowerCase());
    });

    if (lista.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "muted";
        td.textContent = "Nenhum produto cadastrado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    lista.forEach(p => {
        const tr = document.createElement("tr");

        const tdCodigo = document.createElement("td");
        tdCodigo.textContent = p.codigo || "-";
        tr.appendChild(tdCodigo);

        const tdNome = document.createElement("td");
        tdNome.textContent = p.nome;
        tr.appendChild(tdNome);

        const tdPreco = document.createElement("td");
        tdPreco.className = "right";
        tdPreco.textContent = formatarMoeda(getPrecoVenda(p));
        tr.appendChild(tdPreco);

        const tdQtd = document.createElement("td");
        tdQtd.className = "right";
        tdQtd.textContent = p.estoque;
        tr.appendChild(tdQtd);

        const tdStatus = document.createElement("td");
        const span = document.createElement("span");
        span.classList.add("tag");
        if (p.estoque <= 0) {
            span.classList.add("out");
            span.textContent = "Sem estoque";
        } else if (p.estoque <= 5) {
            span.classList.add("low");
            span.textContent = "Baixo";
        } else {
            span.classList.add("ok");
            span.textContent = "OK";
        }
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        corpo.appendChild(tr);
    });
}

function renderTabelaProdutosCadastro() {
    const corpo = document.getElementById("tabelaProdutosCadastro");
    if (!corpo) return;
    corpo.innerHTML = "";

    const lista = produtos.filter(p => {
        if (!filtroProdutosCadastro) return true;
        const txt = ((p.codigo || "") + " " + (p.nome || "")).toLowerCase();
        return txt.includes(filtroProdutosCadastro.toLowerCase());
    });

    if (lista.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "muted";
        td.textContent = "Nenhum produto cadastrado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    lista.forEach(p => {
        const tr = document.createElement("tr");

        const tdCodigo = document.createElement("td");
        tdCodigo.textContent = p.codigo || "-";
        tr.appendChild(tdCodigo);

        const tdNome = document.createElement("td");
        tdNome.textContent = p.nome;
        tr.appendChild(tdNome);

        const tdPreco = document.createElement("td");
        tdPreco.className = "right";
        tdPreco.textContent = formatarMoeda(getPrecoVenda(p));
        tr.appendChild(tdPreco);

        const tdAcoes = document.createElement("td");

        const btnEditar = document.createElement("button");
        btnEditar.className = "btn secondary";
        btnEditar.style.fontSize = "11px";
        btnEditar.textContent = "Editar";
        btnEditar.addEventListener("click", () => carregarProdutoParaEdicao(p.id));
        tdAcoes.appendChild(btnEditar);

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn secondary";
        btnExcluir.style.fontSize = "11px";
        btnExcluir.style.marginLeft = "4px";
        btnExcluir.textContent = "Excluir";
        btnExcluir.addEventListener("click", () => excluirProduto(p.id));
        tdAcoes.appendChild(btnExcluir);

        tr.appendChild(tdAcoes);

        corpo.appendChild(tr);
    });
}

function carregarProdutoParaEdicao(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;

    editingProdutoId = id;
    document.getElementById("inputNomeProduto").value = produto.nome;
    document.getElementById("inputCodigoProduto").value = produto.codigo || "";
    document.getElementById("inputPrecoProduto").value = String(produto.precoBase).replace(".", ",");
    document.getElementById("inputQuantidadeProduto").value = produto.estoque;
    document.getElementById("inputImagemProduto").value = produto.imagem && !produto.imagem.startsWith("data:")
        ? produto.imagem
        : "";
    const outras = (produto.imagens || []).filter(url => url && url !== produto.imagem);
    document.getElementById("inputOutrasImagensProduto").value = outras.join(", ");
    document.getElementById("inputImagemArquivo").value = "";

    document.getElementById("btnSalvarProduto").textContent = "Salvar alterações";
    document.getElementById("btnCancelarEdicaoProduto").style.display = "inline-flex";
    document.getElementById("mensagemProduto").textContent = "Editando produto ID " + id;
}

function limparFormularioProduto() {
    editingProdutoId = null;
    document.getElementById("inputNomeProduto").value = "";
    document.getElementById("inputCodigoProduto").value = "";
    document.getElementById("inputPrecoProduto").value = "";
    document.getElementById("inputQuantidadeProduto").value = "0";
    document.getElementById("inputImagemProduto").value = "";
    document.getElementById("inputOutrasImagensProduto").value = "";
    document.getElementById("inputImagemArquivo").value = "";
    document.getElementById("btnSalvarProduto").textContent = "Cadastrar produto";
    document.getElementById("btnCancelarEdicaoProduto").style.display = "none";
    document.getElementById("mensagemProduto").textContent = "";
}

function excluirProduto(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;
    const conf = confirm(`Excluir o produto "${produto.nome}"? Esta ação não pode ser desfeita.`);
    if (!conf) return;

    produtos = produtos.filter(p => p.id !== id);

    if (editingProdutoId === id) {
        limparFormularioProduto();
    }

    logAcao("excluir_produto", `Produto excluído: ${produto.nome} (${produto.codigo || "-"})`);
    atualizarTudo();
}

// ------------------------
// Loja (vitrine) + produto detalhado
// ------------------------
function abrirProdutoDetalhe(id) {
    const produto = produtos.find(p => p.id === id);
    if (!produto) return;

    produtoDetalheAtualId = id;

    const imagens = (produto.imagens && produto.imagens.length)
        ? produto.imagens
        : [produto.imagem || "https://via.placeholder.com/400x300?text=Sem+imagem"];

    const imgPrincipal = document.getElementById("detalheImagem");
    const thumbsContainer = document.getElementById("detalheThumbs");
    thumbsContainer.innerHTML = "";

    imgPrincipal.src = imagens[0];

    imagens.forEach((url, idx) => {
        const thumb = document.createElement("div");
        thumb.className = "product-gallery-thumb";
        const img = document.createElement("img");
        img.src = url;
        thumb.appendChild(img);
        thumb.addEventListener("click", () => {
            imgPrincipal.src = url;
        });
        thumbsContainer.appendChild(thumb);
    });

    document.getElementById("detalheNome").textContent = produto.nome;
    document.getElementById("detalhePreco").textContent = formatarMoeda(getPrecoVenda(produto));
    document.getElementById("detalheEstoque").textContent = `Estoque: ${produto.estoque} un.`;
    document.getElementById("detalheQtd").value = 1;

    window.location.hash = "produto-" + id;

    mostrarSecao("produtoDetalhe");
}

function renderLojaProdutos() {
    const grid = document.getElementById("gridLojaProdutos");
    if (!grid) return;
    grid.innerHTML = "";

    if (produtos.length === 0) {
        const span = document.createElement("div");
        span.className = "muted";
        span.textContent = "Nenhum produto cadastrado.";
        grid.appendChild(span);
        return;
    }

    produtos.forEach(p => {
        if (p.estoque <= 0) return;

        const card = document.createElement("div");
        card.className = "card-produto";

        const img = document.createElement("img");
        const primeiraImagem = (p.imagens && p.imagens.length) ? p.imagens[0] : (p.imagem || "https://via.placeholder.com/200x160?text=Sem+imagem");
        img.src = primeiraImagem;
        img.alt = p.nome;
        card.appendChild(img);

        const h3 = document.createElement("h3");
        h3.textContent = p.nome;
        card.appendChild(h3);

        const preco = document.createElement("div");
        preco.className = "preco";
        preco.textContent = formatarMoeda(getPrecoVenda(p));
        card.appendChild(preco);

        const estoque = document.createElement("div");
        estoque.className = "estoque-info";
        estoque.textContent = `Estoque: ${p.estoque} un.`;
        card.appendChild(estoque);

        const acoes = document.createElement("div");
        acoes.className = "acoes";

        const btnDetalhes = document.createElement("button");
        btnDetalhes.className = "btn secondary";
        btnDetalhes.textContent = "Ver detalhes";
        btnDetalhes.style.width = "100%";
        btnDetalhes.style.fontSize = "12px";
        btnDetalhes.style.marginTop = "4px";
        btnDetalhes.addEventListener("click", (ev) => {
            ev.stopPropagation();
            abrirProdutoDetalhe(p.id);
        });
        acoes.appendChild(btnDetalhes);

        card.addEventListener("click", () => {
            abrirProdutoDetalhe(p.id);
        });

        card.appendChild(acoes);

        grid.appendChild(card);
    });

    if (!grid.children.length) {
        const span = document.createElement("div");
        span.className = "muted";
        span.textContent = "Nenhum produto disponível no momento.";
        grid.appendChild(span);
    }
}

document.getElementById("btnVoltarLoja").addEventListener("click", () => {
    mostrarSecao("loja");
    window.location.hash = "";
});

document.getElementById("btnAdicionarDetalheCarrinho").addEventListener("click", () => {
    if (!produtoDetalheAtualId) return;
    const produto = produtos.find(p => p.id === produtoDetalheAtualId);
    if (!produto) return;

    const qtd = parseInt(document.getElementById("detalheQtd").value, 10) || 1;
    const msgLoja = document.getElementById("mensagemLoja");
    if (msgLoja) msgLoja.textContent = "";

    if (qtd <= 0) {
        alert("Quantidade deve ser maior que zero.");
        return;
    }

    const existente = carrinhoLoja.find(i => i.produtoId === produto.id);
    const totalDesejado = (existente ? existente.qtd : 0) + qtd;
    if (totalDesejado > produto.estoque) {
        alert("Quantidade maior que o estoque disponível.");
        return;
    }

    if (existente) {
        existente.qtd += qtd;
    } else {
        carrinhoLoja.push({
            produtoId: produto.id,
            nome: produto.nome,
            qtd: qtd,
            precoUnit: getPrecoVenda(produto)
        });
    }

    renderCarrinhoLoja();
    atualizarTotaisLoja();
    alert("Produto adicionado ao carrinho!");
});

window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    if (hash.startsWith("#produto-")) {
        const id = parseInt(hash.replace("#produto-", ""), 10);
        if (!isNaN(id)) {
            abrirProdutoDetalhe(id);
        }
    }
});

// ------------------------
// Dashboard, relatórios etc
// ------------------------
function renderPainelCaixa() {
    const texto = document.getElementById("infoCaixaTexto");
    const detalhes = document.getElementById("infoCaixaDetalhes");
    const botoes = document.getElementById("caixaBotoesAdmin");
    if (!texto || !detalhes || !botoes) return;

    const hoje = hojeStr();
    const c = obterCaixaHoje(false);

    if (!c) {
        texto.textContent = `Caixa de hoje (${formatarDataBrasileira(hoje)}) será aberto automaticamente na primeira venda.`;
        detalhes.textContent = "";
    } else {
        texto.textContent = `Caixa do dia ${formatarDataBrasileira(c.data)} - ` + (c.aberto ? "ABERTO (automático)" : "FECHADO");
        const vendasDia = vendas.filter(v => v.status === "ativa" && v.dataHora.slice(0,10) === c.data);
        const totalDia = vendasDia.reduce((s, v) => s + v.total, 0);
        let detalhesTxt = `Saldo inicial: ${formatarMoeda(c.saldoInicial || 0)}. Faturamento do dia: ${formatarMoeda(totalDia)}.`;
        if (!c.aberto && c.saldoFinal != null) {
            detalhesTxt += ` Saldo final: ${formatarMoeda(c.saldoFinal)}.`;
        }
        detalhes.textContent = detalhesTxt;
    }

    botoes.innerHTML = "<span class='muted'>Abertura e fechamento do caixa são automáticos por dia.</span>";
    atualizarTotaisCaixa();
}

function renderDashboard() {
    const vendasAtivas = vendas.filter(v => v.status === "ativa");
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth();
    const diaStr = hojeStr();

    const vendasDia = vendasAtivas.filter(v => v.dataHora.slice(0,10) === diaStr);
    const totalDia = vendasDia.reduce((s, v) => s + v.total, 0);
    const vendasMes = vendasAtivas.filter(v => {
        const d = new Date(v.dataHora);
        return d.getFullYear() === anoAtual && d.getMonth() === mesAtual;
    });
    const totalMes = vendasMes.reduce((s, v) => s + v.total, 0);

    const vendasAno = vendasAtivas.filter(v => {
        const d = new Date(v.dataHora);
        return d.getFullYear() === anoAtual;
    });
    const totalAno = vendasAno.reduce((s, v) => s + v.total, 0);

    const itensEstoque = produtos.reduce((soma, p) => soma + p.estoque, 0);
    const baixoEstoqueQtd = produtos.filter(p => p.estoque > 0 && p.estoque <= 5).length;

    const dDia = document.getElementById("dashTotalDia");
    const dMes = document.getElementById("dashTotalMes");
    const dAno = document.getElementById("dashTotalAno");
    const dNum = document.getElementById("dashNumeroVendas");
    const dItens = document.getElementById("dashItensEstoque");
    const dBaixo = document.getElementById("dashBaixoEstoque");

    if (dDia) dDia.textContent = formatarMoeda(totalDia);
    if (dMes) dMes.textContent = formatarMoeda(totalMes);
    if (dAno) dAno.textContent = formatarMoeda(totalAno);
    if (dNum) dNum.textContent = vendasAtivas.length;
    if (dItens) dItens.textContent = itensEstoque;
    if (dBaixo) dBaixo.textContent = baixoEstoqueQtd;

    const corpoUlt = document.getElementById("tabelaUltimasVendas");
    if (!corpoUlt) return;
    corpoUlt.innerHTML = "";
    if (vendasAtivas.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "muted";
        td.textContent = "Nenhuma venda registrada ainda.";
        tr.appendChild(td);
        corpoUlt.appendChild(tr);
    } else {
        vendasAtivas.slice(-5).forEach(venda => {
            const tr = document.createElement("tr");

            const tdId = document.createElement("td");
            tdId.textContent = venda.id;
            tr.appendChild(tdId);

            const tdHora = document.createElement("td");
            const data = new Date(venda.dataHora);
            tdHora.textContent = data.toLocaleTimeString("pt-BR");
            tr.appendChild(tdHora);

            const tdOrigem = document.createElement("td");
            tdOrigem.textContent = venda.origem === "loja" ? "Loja" : "Caixa";
            tr.appendChild(tdOrigem);

            const tdItens = document.createElement("td");
            tdItens.textContent = venda.itens.length;
            tr.appendChild(tdItens);

            const tdTotal = document.createElement("td");
            tdTotal.className = "right";
            tdTotal.textContent = formatarMoeda(venda.total);
            tr.appendChild(tdTotal);

            corpoUlt.appendChild(tr);
        });
    }

    const corpoEB = document.getElementById("tabelaEstoqueBaixo");
    if (!corpoEB) return;
    corpoEB.innerHTML = "";
    const listaBaixo = produtos.filter(p => p.estoque > 0 && p.estoque <= 5);
    if (listaBaixo.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 2;
        td.className = "muted";
        td.textContent = "Nenhum produto com estoque baixo.";
        tr.appendChild(td);
        corpoEB.appendChild(tr);
    } else {
        listaBaixo.forEach(p => {
            const tr = document.createElement("tr");
            const tdNome = document.createElement("td");
            tdNome.textContent = p.nome;
            tr.appendChild(tdNome);

            const tdQtd = document.createElement("td");
            tdQtd.textContent = p.estoque;
            tr.appendChild(tdQtd);

            corpoEB.appendChild(tr);
        });
    }
}

function renderRelatorioVendas() {
    const corpo = document.getElementById("tabelaRelatorioVendas");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (vendas.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 11;
        td.className = "muted";
        td.textContent = "Nenhuma venda registrado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    vendas.forEach(v => {
        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = v.id;
        tr.appendChild(tdId);

        const tdHora = document.createElement("td");
        const dt = new Date(v.dataHora);
        tdHora.textContent = dt.toLocaleString("pt-BR");
        tr.appendChild(tdHora);

        const tdOrigem = document.createElement("td");
        tdOrigem.textContent = v.origem === "loja" ? "Loja" : "Caixa";
        tr.appendChild(tdOrigem);

        const tdPg = document.createElement("td");
        tdPg.textContent = v.formaPagamento || "-";
        tr.appendChild(tdPg);

        const tdItens = document.createElement("td");
        tdItens.textContent = v.itens.length;
        tr.appendChild(tdItens);

        const tdStatus = document.createElement("td");
        const span = document.createElement("span");
        span.classList.add("tag");
        if (v.status === "cancelada") {
            span.classList.add("cancelada");
            span.textContent = "Cancelada";
        } else {
            span.classList.add("ativa");
            span.textContent = "Ativa";
        }
        tdStatus.appendChild(span);
        tr.appendChild(tdStatus);

        const tdCupom = document.createElement("td");
        tdCupom.textContent = v.cupomCodigo || "-";
        tr.appendChild(tdCupom);

        const tdSub = document.createElement("td");
        tdSub.className = "right";
        tdSub.textContent = formatarMoeda(v.subtotal || v.total);
        tr.appendChild(tdSub);

        const tdDesc = document.createElement("td");
        tdDesc.className = "right";
        tdDesc.textContent = formatarMoeda(v.descontoCupom || 0);
        tr.appendChild(tdDesc);

        const tdTotal = document.createElement("td");
        tdTotal.className = "right";
        tdTotal.textContent = formatarMoeda(v.total);
        tr.appendChild(tdTotal);

        const tdAcao = document.createElement("td");
        if (
            currentUser.username &&
            currentUser.username.toLowerCase() === "hilariu" &&
            v.status === "ativa"
        ) {
            const btnCancelar = document.createElement("button");
            btnCancelar.textContent = "Cancelar venda";
            btnCancelar.className = "btn secondary";
            btnCancelar.style.fontSize = "11px";
            btnCancelar.addEventListener("click", () => cancelarVenda(v.id));
            tdAcao.appendChild(btnCancelar);
        }
        tr.appendChild(tdAcao);

        corpo.appendChild(tr);
    });
}

// controla qual usuário está em edição
let usuarioEmEdicaoId = null;

function validarFormatoEmailSimples(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function renderUsuariosAdmin() {
    const corpo = document.getElementById("tabelaUsuarios");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (!usuarios.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "muted";
        td.textContent = "Nenhum usuário.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    const roleLabel = (role) => {
        if (role === "admin") return "Admin";
        if (role === "gerente") return "Gerente";
        if (role === "vendedor") return "Vendedor";
        if (role === "estoquista") return "Estoquista";
        return "Cliente";
    };

    usuarios.forEach(u => {
        const tr = document.createElement("tr");
        tr.dataset.id = u.id; // importante para achar depois

        const emEdicao = usuarioEmEdicaoId === u.id;

        // ID
        const tdId = document.createElement("td");
        tdId.textContent = u.id;
        tr.appendChild(tdId);

        // Usuário
        const tdUser = document.createElement("td");
        if (emEdicao && u.username.toLowerCase() !== "hilariu") {
            const inp = document.createElement("input");
            inp.type = "text";
            inp.name = "editUserNome";
            inp.value = u.username || "";
            tdUser.appendChild(inp);
        } else {
            tdUser.textContent = u.username;
        }
        tr.appendChild(tdUser);

        // Email
        const tdEmail = document.createElement("td");
        if (emEdicao && u.username.toLowerCase() !== "hilariu") {
            const inp = document.createElement("input");
            inp.type = "email";
            inp.name = "editUserEmail";
            inp.value = u.email || "";
            tdEmail.appendChild(inp);
        } else {
            tdEmail.textContent = u.email || "-";
        }
        tr.appendChild(tdEmail);

        // Tipo / Cargo
        const tdTipo = document.createElement("td");
        if (emEdicao && u.username.toLowerCase() !== "hilariu") {
            const selectRole = document.createElement("select");
            ["admin", "gerente", "vendedor", "estoquista", "cliente"].forEach(r => {
                const opt = document.createElement("option");
                opt.value = r;
                opt.textContent = roleLabel(r);
                if ((u.role || "cliente") === r) opt.selected = true;
                selectRole.appendChild(opt);
            });
            selectRole.name = "editUserRole";
            tdTipo.appendChild(selectRole);
        } else {
            tdTipo.textContent = roleLabel(u.role || "cliente");
        }
        tr.appendChild(tdTipo);

        // Ações
        const tdAcao = document.createElement("td");

        // Conta "hilariu" intocável (sem edição nem exclusão)
        if (u.username.toLowerCase() === "hilariu") {
            const span = document.createElement("span");
            span.className = "muted";
            span.textContent = "Admin principal";
            tdAcao.appendChild(span);
        } else if (emEdicao) {
            // Campo nova senha (opcional)
            const inpSenha = document.createElement("input");
            inpSenha.type = "password";
            inpSenha.name = "editUserSenha";
            inpSenha.placeholder = "Nova senha (opcional)";
            inpSenha.style.marginRight = "4px";
            tdAcao.appendChild(inpSenha);

            const btnSalvar = document.createElement("button");
            btnSalvar.className = "btn secondary btn-salvar-usuario";
            btnSalvar.textContent = "Salvar";
            btnSalvar.style.marginRight = "4px";
            tdAcao.appendChild(btnSalvar);

            const btnCancelar = document.createElement("button");
            btnCancelar.className = "btn secondary btn-cancelar-edicao-usuario";
            btnCancelar.textContent = "Cancelar";
            tdAcao.appendChild(btnCancelar);
        } else {
            const btnEditar = document.createElement("button");
            btnEditar.className = "btn secondary btn-editar-usuario";
            btnEditar.textContent = "Editar";
            btnEditar.style.marginRight = "4px";
            tdAcao.appendChild(btnEditar);

            const btnExcluir = document.createElement("button");
            btnExcluir.className = "btn secondary btn-excluir-usuario";
            btnExcluir.textContent = "Excluir";
            tdAcao.appendChild(btnExcluir);
        }

        tr.appendChild(tdAcao);
        corpo.appendChild(tr);
    });
}

// Delegação de eventos na tabela de usuários
document.getElementById("tabelaUsuarios").addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;

    const id = parseInt(tr.dataset.id, 10);
    const usuario = usuarios.find(u => u.id === id);
    if (!usuario) return;

    const msg = document.getElementById("mensagemUsuarioAdmin");
    if (msg) msg.textContent = "";

    // Editar
    if (e.target.classList.contains("btn-editar-usuario")) {
        usuarioEmEdicaoId = id;
        renderUsuariosAdmin();
        return;
    }

    // Cancelar edição
    if (e.target.classList.contains("btn-cancelar-edicao-usuario")) {
        usuarioEmEdicaoId = null;
        renderUsuariosAdmin();
        return;
    }

    // Salvar edição
    if (e.target.classList.contains("btn-salvar-usuario")) {
        const inpNome = tr.querySelector('input[name="editUserNome"]');
        const inpEmail = tr.querySelector('input[name="editUserEmail"]');
        const selRole = tr.querySelector('select[name="editUserRole"]');
        const inpSenha = tr.querySelector('input[name="editUserSenha"]');

        const novoNome = (inpNome?.value || "").trim();
        const novoEmail = (inpEmail?.value || "").trim();
        const novaRole = (selRole?.value || usuario.role);
        const novaSenha = (inpSenha?.value || "").trim();

        if (!novoNome || !novoEmail) {
            if (msg) msg.textContent = "Usuário e e-mail não podem ficar vazios.";
            return;
        }

        if (!validarFormatoEmailSimples(novoEmail)) {
            if (msg) msg.textContent = "E-mail inválido.";
            return;
        }

        // Verifica duplicidade (outros usuários)
        const jaExisteUser = usuarios.some(u =>
            u.id !== usuario.id && (u.username || "").toLowerCase() === novoNome.toLowerCase()
        );
        if (jaExisteUser) {
            if (msg) msg.textContent = "Já existe outro usuário com esse nome.";
            return;
        }

        const jaExisteEmail = usuarios.some(u =>
            u.id !== usuario.id && (u.email || "").toLowerCase() === novoEmail.toLowerCase()
        );
        if (jaExisteEmail) {
            if (msg) msg.textContent = "Já existe outro usuário com esse e-mail.";
            return;
        }

        // Aplica alterações
        usuario.username = novoNome;
        usuario.email = novoEmail;
        usuario.role = novaRole;
        usuario.admin = (novaRole === "admin");

        if (novaSenha) {
            usuario.password = novaSenha;
        }

        salvarDB();
        usuarioEmEdicaoId = null;
        renderUsuariosAdmin();

        if (msg) msg.textContent = "Usuário atualizado com sucesso!";
        logAcao("editar_usuario", `Usuário ${usuario.username} atualizado pelo admin ${currentUser.username}.`);

        // se for o usuário logado, atualiza sessão
        if (currentUser.id === usuario.id) {
            setUserFromObj(usuario);
        }
        return;
    }

    // Excluir usuário
    if (e.target.classList.contains("btn-excluir-usuario")) {
        if (usuario.username.toLowerCase() === "hilariu") {
            alert('A conta "hilariu" não pode ser excluída.');
            return;
        }

        if (currentUser.id === usuario.id) {
            alert("Você não pode excluir o usuário que está logado no momento.");
            return;
        }

        const confirmar = confirm(`Deseja realmente excluir o usuário "${usuario.username}"?`);
        if (!confirmar) return;

        const idx = usuarios.findIndex(u => u.id === usuario.id);
        if (idx >= 0) {
            usuarios.splice(idx, 1);
            salvarDB();
            renderUsuariosAdmin();
            if (msg) msg.textContent = "Usuário excluído com sucesso!";
            logAcao("excluir_usuario", `Usuário ${usuario.username} excluído pelo admin ${currentUser.username}.`);
        }
    }
});

// ------------------------
// Logs
// ------------------------
function renderLogsAdmin() {
    const corpo = document.getElementById("tabelaLogs");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (!logs.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "muted";
        td.textContent = "Nenhum log registrado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    [...logs].slice().reverse().forEach(l => {
        const tr = document.createElement("tr");

        const tdData = document.createElement("td");
        tdData.textContent = new Date(l.dataHora).toLocaleString("pt-BR");
        tr.appendChild(tdData);

        const tdUser = document.createElement("td");
        tdUser.textContent = l.usuario || "-";
        tr.appendChild(tdUser);

        const tdAcao = document.createElement("td");
        tdAcao.textContent = l.acao;
        tr.appendChild(tdAcao);

        const tdDet = document.createElement("td");
        tdDet.textContent = l.detalhes || "-";
        tr.appendChild(tdDet);

        corpo.appendChild(tr);
    });
}

// ------------------------
// Cancelamento de venda (apenas admin principal + senha 1337)
// ------------------------
function cancelarVenda(idVenda) {
    if (!currentUser.username || currentUser.username.toLowerCase() !== "hilariu") {
        alert("Apenas o admin principal pode cancelar vendas.");
        return;
    }

    const senha = prompt("Senha do admin principal:");
    if (senha !== "1337") {
        alert("Senha incorreta. Venda NÃO cancelada.");
        return;
    }

    const venda = vendas.find(v => v.id === idVenda);
    if (!venda || venda.status === "cancelada") return;

    const confirma = confirm("Tem certeza que deseja cancelar esta venda? O estoque será devolvido.");
    if (!confirma) return;

    venda.itens.forEach(item => {
        const produto = produtos.find(p => p.id === item.produtoId);
        if (produto) {
            produto.estoque += item.qtd;
        }
    });

    venda.status = "cancelada";

    logAcao("cancelar_venda", `Venda ${venda.id} cancelada por ${currentUser.username}.`);

    atualizarTudo();
    alert("Venda cancelada com sucesso.");
}

// ------------------------
// Cupons
// ------------------------
function encontrarCupomValido(codigo) {
    if (!codigo) return null;
    return cupons.find(c => c.codigo.toLowerCase() === codigo.toLowerCase() && c.ativo !== false) || null;
}

function renderCupons() {
    const corpo = document.getElementById("tabelaCupons");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (!cupons.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "muted";
        td.textContent = "Nenhum cupom cadastrado.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    cupons.forEach((c, index) => {
        const tr = document.createElement("tr");

        const tdCod = document.createElement("td");
        tdCod.textContent = c.codigo;
        tr.appendChild(tdCod);

        const tdDesc = document.createElement("td");
        tdDesc.textContent = c.descontoPercent + "%";
        tr.appendChild(tdDesc);

        const tdStatus = document.createElement("td");
        tdStatus.textContent = c.ativo === false ? "Inativo" : "Ativo";
        tr.appendChild(tdStatus);

        const tdAcao = document.createElement("td");
        if (currentUser.role === "admin") {
            // Botão ativar/desativar
            const btnToggle = document.createElement("button");
            btnToggle.className = "btn secondary";
            btnToggle.style.fontSize = "11px";
            btnToggle.textContent = c.ativo === false ? "Ativar" : "Desativar";
            btnToggle.addEventListener("click", () => {
                c.ativo = c.ativo === false ? true : false;
                logAcao(
                    "alterar_cupom",
                    `Cupom ${c.codigo} agora está ${c.ativo === false ? "inativo" : "ativo"}.`
                );
                salvarDB();
                renderCupons();
            });
            tdAcao.appendChild(btnToggle);

            // Botão excluir
            const btnExcluir = document.createElement("button");
            btnExcluir.className = "btn secondary";
            btnExcluir.style.fontSize = "11px";
            btnExcluir.style.marginLeft = "4px";
            btnExcluir.textContent = "Excluir";
            btnExcluir.addEventListener("click", () => {
                const confirmar = confirm(`Tem certeza que deseja excluir o cupom "${c.codigo}"?`);
                if (!confirmar) return;

                cupons.splice(index, 1);
                salvarDB();
                renderCupons();
                logAcao("excluir_cupom", `Cupom ${c.codigo} excluído.`);
            });
            tdAcao.appendChild(btnExcluir);
        } else {
            const span = document.createElement("span");
            span.className = "muted";
            span.textContent = "-";
            tdAcao.appendChild(span);
        }
        tr.appendChild(tdAcao);

        corpo.appendChild(tr);
    });
}

document.getElementById("btnCriarCupom").addEventListener("click", () => {
    if (currentUser.role !== "admin") {
        alert("Apenas admin pode criar cupons.");
        return;
    }
    const codigo = document.getElementById("inputCodigoCupom").value.trim().toUpperCase();
    const desc = parseFloat(document.getElementById("inputPercentualCupom").value) || 0;
    const msg = document.getElementById("mensagemCupom");
    msg.textContent = "";

    if (!codigo || desc <= 0) {
        msg.textContent = "Informe código e desconto válido.";
        return;
    }
    const jaExiste = cupons.some(c => c.codigo.toLowerCase() === codigo.toLowerCase());
    if (jaExiste) {
        msg.textContent = "Já existe um cupom com esse código.";
        return;
    }

    const novo = {
        codigo,
        descontoPercent: desc,
        ativo: true,
        criadoPor: currentUser.username || "admin"
    };
    cupons.push(novo);
    salvarDB();
    renderCupons();
    msg.textContent = "Cupom criado com sucesso!";

    logAcao("criar_cupom", `Cupom ${codigo} com ${desc}% criado.`);

    document.getElementById("inputCodigoCupom").value = "";
    document.getElementById("inputPercentualCupom").value = "10";
});

document.getElementById("btnAplicarCupomLoja").addEventListener("click", () => {
    const codigo = document.getElementById("inputCupomLoja").value.trim();
    const msg = document.getElementById("mensagemLoja");
    msg.textContent = "";

    const cupom = encontrarCupomValido(codigo);
    if (!cupom) {
        msg.textContent = "Cupom inválido ou inativo.";
        cupomLojaAtual = null;
        atualizarTotaisLoja();
        return;
    }

    cupomLojaAtual = {
        codigo: cupom.codigo,
        descontoPercent: cupom.descontoPercent
    };
    msg.textContent = `Cupom aplicado: ${cupom.codigo} (${cupom.descontoPercent}%)`;
    atualizarTotaisLoja();
});

document.getElementById("btnAplicarCupomCaixa").addEventListener("click", () => {
    const codigo = document.getElementById("inputCupomCaixa").value.trim();
    const msg = document.getElementById("mensagemFinalizacaoCaixa");
    msg.textContent = "";

    const cupom = encontrarCupomValido(codigo);
    if (!cupom) {
        msg.textContent = "Cupom inválido ou inativo.";
        cupomCaixaAtual = null;
        atualizarTotaisCaixa();
        return;
    }

    cupomCaixaAtual = {
        codigo: cupom.codigo,
        descontoPercent: cupom.descontoPercent
    };
    msg.textContent = `Cupom aplicado: ${cupom.codigo} (${cupom.descontoPercent}%)`;
    atualizarTotaisCaixa();
});

// ------------------------
// Registrar vendas
// ------------------------
function registrarVenda(origem, carrinho, formaPagamento) {
    fecharCaixasAntigos();
    garantirCaixaDeHoje();

    if (!formaPagamento) {
        return { ok: false, msg: "Selecione a forma de pagamento." };
    }

    if (carrinho.length === 0) {
        return { ok: false, msg: "Adicione itens antes de finalizar." };
    }

    for (const item of carrinho) {
        const produto = produtos.find(p => p.id === item.produtoId);
        if (!produto) {
            return { ok: false, msg: "Produto não encontrado." };
        }
        if (item.qtd > produto.estoque) {
            return { ok: false, msg: `Estoque insuficiente para o produto: ${produto.nome}.` };
        }
    }

    const subtotal = calcularSubtotal(carrinho);
    const cupomAtual = origem === "loja" ? cupomLojaAtual : cupomCaixaAtual;
    const total = cupomAtual
        ? subtotal * (1 - (cupomAtual.descontoPercent / 100))
        : subtotal;
    const desconto = subtotal - total;

    carrinho.forEach(item => {
        const produto = produtos.find(p => p.id === item.produtoId);
        if (produto) {
            produto.estoque -= item.qtd;
        }
    });

    const novaVenda = {
        id: proximoIdVenda++,
        dataHora: new Date().toISOString(),
        itens: JSON.parse(JSON.stringify(carrinho)),
        subtotal: subtotal,
        descontoCupom: desconto,
        total: total,
        origem: origem,
        formaPagamento: formaPagamento,
        status: "ativa",
        usuario: currentUser.username || null,
        cupomCodigo: cupomAtual ? cupomAtual.codigo : null
    };
    vendas.push(novaVenda);

    logAcao("venda", `Venda ${novaVenda.id} origem ${origem}, total ${formatarMoeda(total)}, cupom ${novaVenda.cupomCodigo || "nenhum"}.`);

    carrinho.length = 0;
    if (origem === "loja") cupomLojaAtual = null;
    if (origem === "caixa") cupomCaixaAtual = null;

    atualizarTudo();

    return { ok: true, total: total };
}

function atualizarTudo() {
    renderTabelaEstoque();
    renderTabelaProdutosCadastro();
    renderDashboard();
    renderRelatorioVendas();
    renderLojaProdutos();
    renderUsuariosAdmin();
    atualizarListaDescontos();
    renderCupons();
    atualizarSelectProdutoCaixa();
    renderPainelCaixa();
    renderEntradasProdutos();
    renderSaidasProdutos();
    renderLogsAdmin();
    salvarDB();

    const campoBuscaSaida = document.getElementById("searchSaidaCodigo");
    const termoAtual = campoBuscaSaida ? campoBuscaSaida.value : "";
    preencherSelectSaida(termoAtual);
}

// ------------------------
// Ações do Caixa
// ------------------------
document.getElementById("btnAdicionarItemCaixa").addEventListener("click", () => {
    const msg = document.getElementById("mensagemCaixa");
    msg.textContent = "";

    if (produtos.length === 0) {
        msg.textContent = "Cadastre produtos antes de usar o caixa.";
        return;
    }

    const select = document.getElementById("selectProdutoCaixa");
    const idProduto = parseInt(select.value, 10);
    const qtd = parseInt(document.getElementById("inputQuantidadeCaixa").value, 10) || 1;

    const produto = produtos.find(p => p.id === idProduto);
    if (!produto) {
        msg.textContent = "Produto inválido.";
        return;
    }

    if (qtd <= 0) {
        msg.textContent = "Quantidade deve ser maior que zero.";
        return;
    }

    if (qtd > produto.estoque) {
        msg.textContent = "Quantidade maior que o estoque disponível.";
        return;
    }

    const existente = carrinhoCaixa.find(i => i.produtoId === produto.id);
    if (existente) {
        if (existente.qtd + qtd > produto.estoque) {
            msg.textContent = "Quantidade total no carrinho excede o estoque.";
            return;
        }
        existente.qtd += qtd;
    } else {
        carrinhoCaixa.push({
            produtoId: produto.id,
            nome: produto.nome,
            qtd: qtd,
            precoUnit: getPrecoVenda(produto)
        });
    }

    renderCarrinhoCaixa();
    atualizarTotaisCaixa();
    msg.textContent = "";
});

document.getElementById("btnCancelarVendaCaixa").addEventListener("click", () => {
    carrinhoCaixa = [];
    cupomCaixaAtual = null;
    document.getElementById("inputCupomCaixa").value = "";
    renderCarrinhoCaixa();
    atualizarTotaisCaixa();
    document.getElementById("mensagemFinalizacaoCaixa").textContent = "";
});

document.getElementById("btnFinalizarVendaCaixa").addEventListener("click", () => {
    const msg = document.getElementById("mensagemFinalizacaoCaixa");
    msg.textContent = "";

    const formaPag = document.getElementById("selectPagamentoCaixa").value;
    const resultado = registrarVenda("caixa", carrinhoCaixa, formaPag);
    if (!resultado.ok) {
        msg.textContent = resultado.msg;
        return;
    }

    renderCarrinhoCaixa();
    atualizarTotaisCaixa();
    msg.textContent = "Venda registrada com sucesso no caixa!";
});

// ------------------------
// Ações da Loja (Carrinho)
// ------------------------
document.getElementById("btnLimparLoja").addEventListener("click", () => {
    carrinhoLoja = [];
    cupomLojaAtual = null;
    document.getElementById("inputCupomLoja").value = "";
    renderCarrinhoLoja();
    atualizarTotaisLoja();
    document.getElementById("mensagemLoja").textContent = "";
});

document.getElementById("btnFinalizarLoja").addEventListener("click", () => {
    const msg = document.getElementById("mensagemLoja");
    msg.textContent = "";

    const formaPag = document.getElementById("selectPagamentoLoja").value;
    const resultado = registrarVenda("loja", carrinhoLoja, formaPag);
    if (!resultado.ok) {
        msg.textContent = resultado.msg;
        return;
    }

    renderCarrinhoLoja();
    atualizarTotaisLoja();
    msg.textContent = "Compra concluída com sucesso!";
});

// ------------------------
// Entrada de produtos
// ------------------------
function renderEntradasProdutos() {
    const corpo = document.getElementById("tabelaEntradas");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (!entradas.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "muted";
        td.textContent = "Nenhuma entrada registrada.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    [...entradas].slice().reverse().forEach(e => {
        const tr = document.createElement("tr");

        const tdData = document.createElement("td");
        tdData.textContent = new Date(e.dataHora).toLocaleString("pt-BR");
        tr.appendChild(tdData);

        const tdProd = document.createElement("td");
        tdProd.textContent = e.nomeProduto || "-";
        tr.appendChild(tdProd);

        const tdQtd = document.createElement("td");
        tdQtd.className = "right";
        tdQtd.textContent = e.quantidade;
        tr.appendChild(tdQtd);

        const tdUser = document.createElement("td");
        tdUser.textContent = e.usuario || "-";
        tr.appendChild(tdUser);

        corpo.appendChild(tr);
    });
}

document.getElementById("btnRegistrarEntrada").addEventListener("click", () => {
    const msg = document.getElementById("mensagemEntrada");
    msg.textContent = "";

    if (produtos.length === 0) {
        msg.textContent = "Cadastre um produto antes de registrar entrada.";
        return;
    }

    const select = document.getElementById("selectProdutoEntrada");
    const idProduto = parseInt(select.value, 10);
    const qtd = parseInt(document.getElementById("inputQuantidadeEntrada").value, 10) || 0;
    const obs = document.getElementById("inputObsEntrada").value.trim();

    const produto = produtos.find(p => p.id === idProduto);
    if (!produto) {
        msg.textContent = "Produto inválido.";
        return;
    }
    if (qtd <= 0) {
        msg.textContent = "Quantidade deve ser maior que zero.";
        return;
    }

    produto.estoque += qtd;

    const novaEntrada = {
        dataHora: new Date().toISOString(),
        produtoId: produto.id,
        nomeProduto: produto.nome,
        quantidade: qtd,
        observacao: obs,
        usuario: currentUser.username || null
    };
    entradas.push(novaEntrada);

    logAcao("entrada_estoque", `Entrada de ${qtd} un. para ${produto.nome}. Obs: ${obs || "-"} `);

    atualizarTudo();

    document.getElementById("inputQuantidadeEntrada").value = 1;
    document.getElementById("inputObsEntrada").value = "";
    msg.textContent = "Entrada registrada com sucesso!";
});

// filtro por código **ou nome** em entrada
document.getElementById("searchEntradaCodigo").addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase().trim();
    const select = document.getElementById("selectProdutoEntrada");
    if (!select) return;
    select.innerHTML = "";

    const filtrados = produtos.filter(p => {
        const codigo = (p.codigo || "").toLowerCase();
        const nome = (p.nome || "").toLowerCase();
        // Se não tiver termo, mostra tudo. Senão, filtra por código OU nome.
        return !termo || codigo.includes(termo) || nome.includes(termo);
    });

    if (!filtrados.length) {
        const opt = document.createElement("option");
        opt.textContent = "Nenhum produto encontrado";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
    } else {
        filtrados.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.codigo || ""} - ${p.nome} (Estoque: ${p.estoque})`;
            select.appendChild(opt);
        });
    }
});


// ------------------------
// Saída de produtos
// ------------------------
function renderSaidasProdutos() {
    const corpo = document.getElementById("tabelaSaidas");
    if (!corpo) return;
    corpo.innerHTML = "";

    if (!saidas.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.className = "muted";
        td.textContent = "Nenhuma saída registrada.";
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
    }

    [...saidas].slice().reverse().forEach(s => {
        const tr = document.createElement("tr");

        const tdData = document.createElement("td");
        tdData.textContent = new Date(s.dataHora).toLocaleString("pt-BR");
        tr.appendChild(tdData);

        const tdProd = document.createElement("td");
        tdProd.textContent = s.nomeProduto || "-";
        tr.appendChild(tdProd);

        const tdQtd = document.createElement("td");
        tdQtd.className = "right";
        tdQtd.textContent = s.quantidade;
        tr.appendChild(tdQtd);

        const tdUser = document.createElement("td");
        tdUser.textContent = s.usuario || "-";
        tr.appendChild(tdUser);

        corpo.appendChild(tr);
    });
}

// SELECT de saída igual ao de entrada (busca por código OU nome, mostra tudo se vazio)
function preencherSelectSaida(termoBusca = "") {
    const select = document.getElementById("selectProdutoSaida");
    if (!select) return;

    const termo = termoBusca.toLowerCase().trim();
    select.innerHTML = "";

    if (!Array.isArray(produtos) || produtos.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "Nenhum produto cadastrado";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
        return;
    }

    const filtrados = produtos.filter(p => {
        const codigo = (p.codigo || "").toLowerCase();
        const nome = (p.nome || "").toLowerCase();
        // Se não tiver termo, mostra todos; senão, filtra por código OU nome
        return !termo || codigo.includes(termo) || nome.includes(termo);
    });

    if (!filtrados.length) {
        const opt = document.createElement("option");
        opt.textContent = "Nenhum produto encontrado";
        opt.disabled = true;
        opt.selected = true;
        select.appendChild(opt);
    } else {
        filtrados.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.codigo || ""} - ${p.nome} (Estoque: ${p.estoque})`;
            select.appendChild(opt);
        });
    }
}

document.getElementById("btnRegistrarSaida").addEventListener("click", () => {
    const msg = document.getElementById("mensagemSaida");
    msg.textContent = "";

    if (!Array.isArray(produtos) || produtos.length === 0) {
        msg.textContent = "Cadastre um produto antes de registrar saída.";
        return;
    }

    const select = document.getElementById("selectProdutoSaida");
    const idProduto = parseInt(select.value, 10);
    const qtd = parseInt(document.getElementById("inputQuantidadeSaida").value, 10) || 0;
    const obs = document.getElementById("inputObsSaida").value.trim();

    const produto = produtos.find(p => p.id === idProduto);
    if (!produto) {
        msg.textContent = "Produto inválido.";
        return;
    }
    if (qtd <= 0) {
        msg.textContent = "Quantidade deve ser maior que zero.";
        return;
    }
    if (produto.estoque < qtd) {
        msg.textContent = `Estoque insuficiente. Estoque atual: ${produto.estoque}.`;
        return;
    }

    // Atualiza estoque
    produto.estoque -= qtd;

    const novaSaida = {
        dataHora: new Date().toISOString(),
        produtoId: produto.id,
        nomeProduto: produto.nome,
        quantidade: qtd,
        observacao: obs,
        usuario: currentUser.username || null
    };
    saidas.push(novaSaida);

    logAcao("saida_estoque", `Saída de ${qtd} un. de ${produto.nome}. Obs: ${obs || "-"} `);

    atualizarTudo(); // atualiza estoque, dashboards, etc.

    document.getElementById("inputQuantidadeSaida").value = 1;
    document.getElementById("inputObsSaida").value = "";
    msg.textContent = "Saída registrada com sucesso!";
});

// Filtro por código **ou nome** em SAÍDA
document.getElementById("searchSaidaCodigo").addEventListener("input", (e) => {
    preencherSelectSaida(e.target.value);
});






document.addEventListener("DOMContentLoaded", () => {
    function $(id) {
        return document.getElementById(id);
    }

    // ------------------------
    // Cadastro / edição de produtos (com múltiplas imagens)
    // ------------------------
    const btnSalvarProduto = $("btnSalvarProduto");

    if (btnSalvarProduto) {
        btnSalvarProduto.addEventListener("click", () => {
            const inputNome = $("inputNomeProduto");
            const inputCodigo = $("inputCodigoProduto");
            const inputPreco = $("inputPrecoProduto");
            const inputQtd = $("inputQuantidadeProduto");
            const inputImagemUrl = $("inputImagemProduto");
            const inputOutrasImagens = $("inputOutrasImagensProduto");
            const arquivoInput = $("inputImagemArquivo");
            const msg = $("mensagemProduto");

            if (msg) msg.textContent = "";

            // Se algum campo essencial não existir, evitamos erro
            if (!inputNome || !inputPreco || !inputQtd) {
                console.error("Alguns inputs obrigatórios não foram encontrados no DOM.");
                if (msg) msg.textContent = "Erro interno: campos não encontrados.";
                return;
            }

            const nome = inputNome.value.trim();
            const codigo = inputCodigo ? inputCodigo.value.trim() : "";
            const preco = parseFloat((inputPreco.value || "0").replace(",", ".")) || 0;
            const quantidade = parseInt(inputQtd.value, 10) || 0;
            const imagemUrl = inputImagemUrl ? inputImagemUrl.value.trim() : "";
            const outrasImagensStr = inputOutrasImagens ? inputOutrasImagens.value.trim() : "";
            const arquivo = arquivoInput && arquivoInput.files ? arquivoInput.files[0] : null;

            // validações básicas
            if (!nome) {
                if (msg) msg.textContent = "Informe o nome do produto.";
                return;
            }
            if (preco <= 0) {
                if (msg) msg.textContent = "Informe um preço válido.";
                return;
            }
            if (quantidade < 0) {
                if (msg) msg.textContent = "Quantidade não pode ser negativa.";
                return;
            }

            const outrasImagens = outrasImagensStr
                ? outrasImagensStr
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                : [];

            // Garante que o array global de produtos exista
            let listaProdutos = [];
            if (Array.isArray(window.produtos)) {
                listaProdutos = window.produtos;
            } else {
                window.produtos = [];
                listaProdutos = window.produtos;
            }

            // Garante que proximoIdProduto exista
            if (typeof window.proximoIdProduto !== "number") {
                const maxId = listaProdutos.length
                    ? Math.max(...listaProdutos.map((p) => p.id || 0))
                    : 0;
                window.proximoIdProduto = maxId + 1;
            }

            const editingId =
                typeof window.editingProdutoId === "number"
                    ? window.editingProdutoId
                    : null;

            function salvarProdutoComImagem(imagemPrincipal) {
                const listaImagens = [];
                if (imagemPrincipal) listaImagens.push(imagemPrincipal);

                // adiciona demais imagens, sem duplicar
                outrasImagens.forEach((u) => {
                    if (!listaImagens.includes(u)) listaImagens.push(u);
                });

                if (editingId) {
                    // edição
                    const produto = listaProdutos.find((p) => p.id === editingId);
                    if (!produto) {
                        if (msg) msg.textContent = "Produto para edição não encontrado.";
                        return;
                    }

                    produto.nome = nome;
                    produto.codigo = codigo;
                    produto.precoBase = preco;
                    produto.estoque = quantidade;

                    if (listaImagens.length) {
                        produto.imagem = listaImagens[0];
                        produto.imagens = listaImagens;
                    } else {
                        produto.imagem = "";
                        produto.imagens = [];
                    }

                    if (msg) msg.textContent = "Produto atualizado com sucesso!";
                    if (typeof window.logAcao === "function") {
                        window.logAcao(
                            "editar_produto",
                            `Produto ${produto.nome} (${produto.codigo || "-"}) atualizado.`
                        );
                    }
                } else {
                    // cadastro novo
                    const novoProduto = {
                        id: window.proximoIdProduto++,
                        codigo,
                        nome,
                        precoBase: preco,
                        descontoPercent: 0,
                        estoque: quantidade,
                        imagem: listaImagens[0] || "",
                        imagens: listaImagens,
                    };

                    listaProdutos.push(novoProduto);
                    if (msg) msg.textContent = "Produto cadastrado com sucesso!";
                    if (typeof window.logAcao === "function") {
                        window.logAcao(
                            "criar_produto",
                            `Produto criado: ${nome} (${codigo || "-"})`
                        );
                    }
                }

                if (typeof window.atualizarTudo === "function") {
                    window.atualizarTudo();
                }

                if (typeof window.limparFormularioProduto === "function") {
                    window.limparFormularioProduto();
                }
            }

            if (arquivo) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const dataUrl = e.target.result;
                    salvarProdutoComImagem(dataUrl);
                };
                reader.readAsDataURL(arquivo);
            } else {
                salvarProdutoComImagem(imagemUrl || null);
            }
        });
    }

    // ------------------------
    // Botão "Cancelar" da seção de descontos
    // ------------------------
    const btnCancelar = $("btnCancelarEdicaoProduto"); // confira se o ID no HTML é esse

    if (btnCancelar) {
        btnCancelar.addEventListener("click", () => {
            if (typeof window.limparFormularioProduto === "function") {
                window.limparFormularioProduto();
            }

            const selectProdutoDesconto = $("selectProdutoDesconto");
            const inputPercentualDesconto = $("inputPercentualDesconto");
            const mensagemDesconto = $("mensagemDesconto");

            if (selectProdutoDesconto) selectProdutoDesconto.selectedIndex = 0;
            if (inputPercentualDesconto) inputPercentualDesconto.value = 0;
            if (mensagemDesconto) mensagemDesconto.textContent = "";
        });
    }
});

// ------------------------
// Lista de descontos ativos
// ------------------------
function atualizarListaDescontos() {
    const div = document.getElementById("listaDescontos");
    if (!div) {
        console.warn('Elemento "listaDescontos" não encontrado no DOM.');
        return;
    }

    div.innerHTML = "";

    const listaProdutos = Array.isArray(window.produtos) ? window.produtos : [];

    const produtosComDesconto = listaProdutos.filter(
        (p) => (p.descontoPercent || 0) > 0
    );

    if (produtosComDesconto.length === 0) {
        div.innerHTML = "<p>Nenhum desconto ativo.</p>";
        return;
    }

    produtosComDesconto.forEach((prod) => {
        const item = document.createElement("div");
        item.className = "item-desconto";

        item.innerHTML = `
            <div>
                <strong>${prod.nome}</strong> (${prod.codigo || "-"})  
                — <span>${prod.descontoPercent}% OFF</span>
            </div>
            <button class="btn-remover-desconto" data-id="${prod.id}">
                Remover
            </button>
        `;

        div.appendChild(item);
    });

    div.querySelectorAll(".btn-remover-desconto").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            const listaProdutos = Array.isArray(window.produtos) ? window.produtos : [];
            const produto = listaProdutos.find((p) => p.id === id);
            if (!produto) return;

            produto.descontoPercent = 0;

            if (typeof window.salvarDB === "function") {
                window.salvarDB();
            }
            if (typeof window.atualizarTudo === "function") {
                window.atualizarTudo();
            }
            if (typeof window.logAcao === "function") {
                window.logAcao(
                    "desconto_produto_removido",
                    `Removido desconto de ${produto.nome} (${produto.codigo || "-"})`
                );
            }
        });
    });
}

    // Eventos para remover
    document.querySelectorAll(".btnRemoverDesconto").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.getAttribute("data-id"), 10);
            const produto = produtos.find(p => p.id === id);
            if (!produto) return;

            produto.descontoPercent = 0;
            salvarDB();
            atualizarTudo();
            logAcao("desconto_produto_removido", `Removido desconto de ${produto.nome} (${produto.codigo || "-"})`);
        });
    });


// ------------------------
// Criação de usuário pelo admin
// ------------------------
document.getElementById("btnCriarUsuarioAdmin").addEventListener("click", () => {
    if (currentUser.role !== "admin") {
        alert("Apenas admin pode criar usuários.");
        return;
    }

    const nome = document.getElementById("novoUserNome").value.trim();
    const email = document.getElementById("novoUserEmail").value.trim();
    const senha = document.getElementById("novoUserSenha").value.trim();
    const role = document.getElementById("novoUserRole").value;
    const msg = document.getElementById("mensagemUsuarioAdmin");
    msg.textContent = "";

    if (!nome || !email || !senha) {
        msg.textContent = "Preencha usuário, e-mail e senha.";
        return;
    }
    if (nome.toLowerCase() === "hilariu") {
        msg.textContent = "O usuário 'hilariu' é reservado para o admin principal.";
        return;
    }
    const jaExiste = usuarios.some(u => u.username.toLowerCase() === nome.toLowerCase());
    if (jaExiste) {
        msg.textContent = "Já existe usuário com esse nome.";
        return;
    }

    const novoUsuario = {
        id: proximoIdUsuario++,
        username: nome,
        senha: senha,
        email: email,
        admin: role === "admin",
        role
    };
    usuarios.push(novoUsuario);
    salvarDB();
    renderUsuariosAdmin();

    msg.textContent = "Usuário criado com sucesso!";
    logAcao("criar_usuario", `Usuário criado: ${nome} (${role})`);

    document.getElementById("novoUserNome").value = "";
    document.getElementById("novoUserEmail").value = "";
    document.getElementById("novoUserSenha").value = "";
    document.getElementById("novoUserRole").value = "cliente";
});

// ------------------------
// Pesquisas Estoque / Produtos
// ------------------------
document.getElementById("searchEstoque").addEventListener("input", (e) => {
    filtroEstoque = e.target.value;
    renderTabelaEstoque();
});

document.getElementById("searchProdutosCadastro").addEventListener("input", (e) => {
    filtroProdutosCadastro = e.target.value;
    renderTabelaProdutosCadastro();
});

// ------------------------
// Inicialização
// ------------------------
function init() {
    carregarDB();

    fecharCaixasAntigos();
    garantirCaixaDeHoje();

    atualizarSelectProdutoCaixa();
    renderCarrinhoCaixa();
    renderCarrinhoLoja();
    atualizarTotaisCaixa();
    atualizarTotaisLoja();
    atualizarVisibilidadePorRole();

    const rememberedId = localStorage.getItem(REMEMBER_KEY);
    if (rememberedId) {
        const user = usuarios.find(u => u.id === Number(rememberedId));
        if (user) {
            setUserFromObj(user);
        } else {
            setUserFromObj(null);
            localStorage.removeItem(REMEMBER_KEY);
        }
    } else {
        setUserFromObj(null);
    }

    atualizarTudo();

    const hash = window.location.hash;
    if (hash.startsWith("#produto-")) {
        const id = parseInt(hash.replace("#produto-", ""), 10);
        if (!isNaN(id)) {
            abrirProdutoDetalhe(id);
        }
    }
}

init();
