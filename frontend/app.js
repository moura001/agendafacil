// AgendaFácil - frontend da PoC (JavaScript puro, sem dependências).
(() => {
  const $ = (id) => document.getElementById(id);
  const estado = { servico: null, data: null, hora: null };

  const hojeISO = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  const dataBR = (iso) => iso.split("-").reverse().join("/");
  const dinheiro = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const limpar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };

  async function api(caminho, opcoes) {
    const resp = await fetch(caminho, opcoes);
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) throw Object.assign(new Error(corpo.erro || "Erro inesperado."), { status: resp.status });
    return corpo;
  }

  // ---------- navegação entre etapas
  function irPara(n) {
    for (let i = 1; i <= 4; i++) {
      $("etapa" + i).classList.toggle("oculto", i !== n);
      const p = $("p" + i);
      p.classList.toggle("atual", i === n);
      p.classList.toggle("feito", i < n);
    }
  }

  // ---------- etapa 1: serviços
  async function carregarServicos() {
    const lista = $("lista-servicos");
    try {
      const servicos = await api("/api/servicos");
      limpar(lista);
      servicos.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "card";
        const nome = document.createElement("strong");
        nome.textContent = s.nome;
        const det = document.createElement("small");
        det.textContent = `${s.duracao_min} min · ${dinheiro(s.preco)}`;
        b.append(nome, det);
        b.addEventListener("click", () => { estado.servico = s; irPara(2); carregarHorarios(); });
        lista.appendChild(b);
      });
    } catch (e) {
      lista.textContent = "Não foi possível carregar os serviços. O servidor está rodando?";
    }
  }

  // ---------- etapa 2: data e horário
  async function carregarHorarios() {
    const box = $("horarios");
    estado.data = $("data").value;
    limpar(box);
    if (!estado.data) return;
    const aviso = document.createElement("p");
    aviso.textContent = "Carregando horários…";
    box.appendChild(aviso);
    try {
      const r = await api(`/api/horarios?servico_id=${estado.servico.id}&data=${estado.data}`);
      limpar(box);
      if (r.livres.length === 0) {
        const p = document.createElement("p");
        p.textContent = "Não há horários livres neste dia. Tente outra data.";
        box.appendChild(p);
        return;
      }
      r.livres.forEach((h) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = h;
        b.addEventListener("click", () => {
          estado.hora = h;
          $("resumo").textContent =
            `${estado.servico.nome} · ${dataBR(estado.data)} às ${h} · ${dinheiro(estado.servico.preco)}`;
          $("erro").textContent = "";
          irPara(3);
        });
        box.appendChild(b);
      });
    } catch (e) {
      limpar(box);
      const p = document.createElement("p");
      p.textContent = e.message;
      box.appendChild(p);
    }
  }

  // ---------- etapa 3: dados e confirmação
  async function enviar(ev) {
    ev.preventDefault();
    const botao = ev.target.querySelector("button[type=submit]");
    botao.disabled = true;
    $("erro").textContent = "";
    try {
      const r = await api("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servico_id: estado.servico.id,
          data: estado.data,
          hora: estado.hora,
          nome: $("nome").value,
          telefone: $("telefone").value,
        }),
      });
      $("confirmacao").textContent =
        `${r.cliente}, seu horário de ${r.servico} está reservado para ${dataBR(r.data)}, das ${r.inicio} às ${r.fim}.`;
      irPara(4);
    } catch (e) {
      $("erro").textContent = e.message;
      if (e.status === 409) {  // horário foi ocupado por outra pessoa: volta e recarrega
        irPara(2);
        carregarHorarios();
      }
    } finally {
      botao.disabled = false;
    }
  }

  // ---------- painel do profissional
  async function carregarPainel() {
    const data = $("data-painel").value;
    const corpo = $("tabela");
    limpar(corpo);
    if (!data) return;
    const lista = await api(`/api/agendamentos?data=${data}`);
    $("vazio").classList.toggle("oculto", lista.length > 0);
    lista.forEach((a) => {
      const tr = document.createElement("tr");
      [`${a.inicio}–${a.fim}`, a.cliente, a.servico, a.telefone].forEach((t) => {
        const td = document.createElement("td");
        td.textContent = t;
        tr.appendChild(td);
      });
      const td = document.createElement("td");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Cancelar";
      b.addEventListener("click", async () => {
        if (!confirm(`Cancelar o horário de ${a.cliente}?`)) return;
        await api(`/api/agendamentos/${a.id}`, { method: "DELETE" });
        carregarPainel();
      });
      td.appendChild(b);
      tr.appendChild(td);
      corpo.appendChild(tr);
    });
  }

  function trocarAba(painel) {
    $("tela-cliente").classList.toggle("oculto", painel);
    $("tela-painel").classList.toggle("oculto", !painel);
    $("aba-cliente").classList.toggle("ativa", !painel);
    $("aba-painel").classList.toggle("ativa", painel);
    if (painel) carregarPainel();
  }

  // ---------- inicialização
  function reiniciar() {
    estado.servico = estado.hora = null;
    $("form-dados").reset();
    irPara(1);
  }

  const hoje = hojeISO();
  [$("data"), $("data-painel")].forEach((i) => { i.value = hoje; });
  $("data").min = hoje;
  $("data").addEventListener("change", carregarHorarios);
  $("data-painel").addEventListener("change", carregarPainel);
  $("form-dados").addEventListener("submit", enviar);
  $("novo").addEventListener("click", reiniciar);
  $("aba-cliente").addEventListener("click", () => trocarAba(false));
  $("aba-painel").addEventListener("click", () => trocarAba(true));
  document.querySelectorAll(".voltar").forEach((b) =>
    b.addEventListener("click", () => irPara(Number(b.dataset.volta))));
  carregarServicos();
  if (location.hash === "#painel") trocarAba(true);  // atalho: abre direto o painel
})();
