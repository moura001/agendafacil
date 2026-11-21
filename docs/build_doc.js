// Gera o documento da entrega em Word (ABNT). Uso: node build_doc.js [pages.json]
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header,
  AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle, LevelFormat,
  PageNumber, TabStopType, LeaderType, PageBreak, VerticalAlign,
} = require("docx");

const FONT = "Arial";
const AUTOR = "MARCELO MOURA";
const LOCAL = "CONTAGEM";
const ANO = "2026";
const pages = fs.existsSync(process.argv[2] || "") ? JSON.parse(fs.readFileSync(process.argv[2])) : {};

// ---------- helpers de texto
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: 24, ...o });
const body = (t, o = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 0 },
    indent: { firstLine: 709 },
    children: Array.isArray(t) ? t : [run(t)],
    ...o,
  });
const h1 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 360, line: 360 }, children: [new TextRun({ text: t.toUpperCase(), bold: true, font: FONT, size: 24 })] });
const h2 = (t) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 240, line: 360 }, children: [new TextRun({ text: t, bold: true, font: FONT, size: 24 })] });
const bullet = (t) =>
  new Paragraph({ numbering: { reference: "marcador", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: 360 }, children: [run(t)] });
const legenda = (t) =>
  new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 240, after: 120, line: 240 }, children: [run(t, { size: 20 })] });
const fonte = (t) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 240, line: 240 }, children: [run("Fonte: " + t, { size: 20 })] });
const vazio = () => new Paragraph({ spacing: { line: 360 }, children: [] });

// ---------- tabelas (fonte 10, espaçamento simples)
const borda = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const bordas = { top: borda, bottom: borda, left: borda, right: borda };
const TOTAL = 9072; // largura útil: 21 cm - 3 cm - 2 cm = 16 cm
function tabela(cols, cab, linhas) {
  const soma = cols.reduce((a, b) => a + b, 0);
  const w = cols.map((c) => Math.round((c / soma) * TOTAL));
  w[w.length - 1] += TOTAL - w.reduce((a, b) => a + b, 0);
  const cel = (t, i, head) =>
    new TableCell({
      width: { size: w[i], type: WidthType.DXA },
      borders: bordas,
      verticalAlign: VerticalAlign.TOP,
      shading: head ? { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: String(t).split("\n").map((l) => new Paragraph({ spacing: { line: 240 }, children: [new TextRun({ text: l, font: FONT, size: 20, bold: head })] })),
    });
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((c, i) => cel(c, i, true)) }),
      ...linhas.map((l) => new TableRow({ cantSplit: true, children: l.map((c, i) => cel(c, i, false)) })),
    ],
  });
}
function figura(arq, largCm, altCm) {
  const k = 360000 / 9525; // cm -> px (aprox. 37.8)
  return new Paragraph({
    alignment: AlignmentType.CENTER, keepNext: true,
    children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(__dirname, "img", arq)), transformation: { width: Math.round(largCm * 37.8), height: Math.round(altCm * 37.8) }, altText: { title: arq, description: "Captura de tela do sistema AgendaFácil", name: arq } })],
  });
}

// ---------- estrutura (títulos do sumário)
const T = [
  [1, "1 INTRODUÇÃO"],
  [1, "2 VISÃO DE PRODUTO"],
  [2, "2.1 Contextualização e problema"],
  [2, "2.2 Objetivo do produto"],
  [2, "2.3 Escopo"],
  [2, "2.4 Análise de soluções similares"],
  [2, "2.5 Partes interessadas e relação de influência"],
  [2, "2.6 Requisitos principais"],
  [1, "3 PERSONAS"],
  [1, "4 JORNADA DO USUÁRIO"],
  [1, "5 PROVA DE CONCEITO (PoC)"],
  [2, "5.1 Definição da PoC"],
  [2, "5.2 Preparação do ambiente"],
  [2, "5.3 Desenvolvimento do frontend"],
  [2, "5.4 Desenvolvimento do backend e dos dados"],
  [2, "5.5 Testes e resultados"],
  [2, "5.6 Repositório no GitHub"],
  [2, "5.7 Vídeo de demonstração"],
  [1, "6 CONSIDERAÇÕES FINAIS"],
  [1, "REFERÊNCIAS"],
];
const H = (t) => (t.match(/^\d+\.\d+ /) ? h2(t) : h1(t.replace(/^\d+ /, (m) => m)));
const tit = (t) => { const n = T.find((x) => x[1] === t); return n[0] === 2 ? h2(t) : h1(t); };

// ---------- capa e sumário
const centro = (t, o = {}, sp = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 360, ...sp }, children: [run(t, o)] });
const capa = [
  centro("SENAC EAD", { bold: true }),
  centro("CURSO SUPERIOR DE TECNOLOGIA EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS (TADS / TSI)", { bold: true }),
  centro("PROJETO INTEGRADOR: DESENVOLVIMENTO DE SISTEMAS ORIENTADO A DISPOSITIVOS MÓVEIS E BASEADOS NA WEB"),
  centro(AUTOR, { bold: true }, { before: 2200 }),
  centro("AGENDAFÁCIL: SISTEMA WEB DE AGENDAMENTO DE SERVIÇOS", { bold: true }, { before: 2800 }),
  centro("Visão de produto, personas, jornada do usuário e prova de conceito", {}, { before: 120 }),
  centro(LOCAL, {}, { before: 3600 }),
  centro(ANO),
];
const sumario = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360, line: 360 }, children: [run("SUMÁRIO", { bold: true })] }),
  ...T.map(([nivel, t]) =>
    new Paragraph({
      spacing: { line: 360 },
      indent: { left: nivel === 2 ? 425 : 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: TOTAL, leader: LeaderType.DOT }],
      children: [run(t, { bold: nivel === 1 }), run("\t" + String(pages[t] || "0"), { bold: nivel === 1 })],
    })),
];

// ---------- conteúdo
const c = [];
c.push(tit("1 INTRODUÇÃO"));
c.push(body("Este documento reúne as entregas da primeira e da segunda etapas do Projeto Integrador do curso, apresentadas aqui como um único projeto contínuo. A primeira etapa define o produto: sua visão, as personas e as jornadas dos usuários. A segunda etapa transforma uma dessas jornadas em uma Prova de Conceito (PoC) funcional, com frontend, backend, banco de dados e repositório público."));
c.push(body("O projeto escolhido é o AgendaFácil, um sistema web de agendamento de serviços para pequenos salões e barbearias. A escolha se justifica por reunir, em escala reduzida, problemas técnicos reais de sistemas orientados à web: modelagem de dados, regras de negócio com validação no servidor, comunicação entre cliente e servidor por API e uma interface que precisa funcionar bem no celular."));
c.push(body("O documento está organizado em seis seções. A seção 2 apresenta a visão de produto; a seção 3, as personas; a seção 4, a jornada do usuário; a seção 5 descreve a construção e a validação da PoC; e a seção 6 traz as considerações finais."));

c.push(tit("2 VISÃO DE PRODUTO"));
c.push(tit("2.1 Contextualização e problema"));
c.push(body("Pequenos estabelecimentos de beleza costumam organizar a agenda de forma manual: caderno, conversas de aplicativo de mensagens ou planilha. Nesse modelo, o cliente depende de o profissional estar disponível para responder, e o profissional precisa interromper o atendimento para negociar horários. Como cada serviço tem duração diferente, também é fácil marcar dois atendimentos que se sobrepõem."));
c.push(body("O problema que o AgendaFácil se propõe a resolver é, portanto, duplo. Para o cliente, a dificuldade de descobrir quais horários estão realmente livres sem precisar ligar ou esperar resposta. Para o profissional, o risco de conflitos de agenda e o tempo gasto em trocas de mensagens para marcar e remarcar."));
c.push(tit("2.2 Objetivo do produto"));
c.push(body("O objetivo do AgendaFácil é permitir que o cliente agende um serviço sozinho, a qualquer hora, escolhendo apenas entre horários que de fato estão livres, e que o profissional visualize e gerencie a agenda do dia em uma única tela. O valor entregue é a eliminação de conflitos de horário e a redução do tempo gasto com atendimento de agendamentos."));
c.push(tit("2.3 Escopo"));
c.push(body("Dentro do escopo do produto: catálogo de serviços com duração e preço; consulta de horários livres por serviço e data; agendamento com nome e telefone do cliente; confirmação imediata; listagem e cancelamento de agendamentos pelo profissional. Fora do escopo desta fase: pagamento online, login de clientes, lembretes automáticos por mensagem, múltiplos profissionais e múltiplas unidades."));
c.push(tit("2.4 Análise de soluções similares"));
c.push(body([run("Antes de definir o produto, foram analisadas duas soluções existentes no mercado brasileiro. O Trinks é descrito como um sistema de gestão para salões e barbearias que oferece agenda online, controle de estoque e cálculo automático de comissões (CAPTERRA, s.d.), além de um aplicativo no qual o cliente consulta horários livres (TRINKS, s.d.). O Booksy se apresenta como uma solução de software voltada a dispositivos móveis que combina agendamento, recebimento de pagamentos e formação de base de clientes (BOOKSY, s.d.a), com agendamento disponível 24 horas por dia e lembretes dos horários marcados (BOOKSY, s.d.b).")]));
c.push(body("Ambas são plataformas completas, voltadas à gestão do negócio como um todo. Isso é uma força, mas também uma barreira para o microempreendedor que precisa apenas de uma agenda simples: exigem cadastro, aprendizado e, em geral, assinatura. O Quadro 1 compara as alternativas."));
c.push(legenda("Quadro 1 – Comparação entre soluções para agendamento"));
c.push(tabela([2.2, 2.6, 2.6, 2.6], ["Critério", "Agenda manual / mensagens", "Soluções completas (Trinks, Booksy)", "AgendaFácil (proposta)"], [
  ["Disponibilidade de horários ao cliente", "Depende de resposta do profissional", "Consulta online 24 h", "Consulta online 24 h"],
  ["Prevenção de conflitos", "Manual, sujeita a erro", "Automática", "Automática, validada no servidor"],
  ["Abrangência", "Nenhuma ferramenta", "Gestão completa (estoque, comissões, pagamentos, marketing)", "Foco único: agendar sem conflito"],
  ["Curva de aprendizado", "Nenhuma", "Maior, por causa do conjunto de recursos", "Mínima: quatro passos"],
  ["Custo", "Zero", "Planos pagos por assinatura", "Código aberto, hospedagem própria"],
]));
c.push(fonte("elaborado pelo autor, com base em Booksy (s.d.a), Capterra (s.d.) e Trinks (s.d.)."));
c.push(body("A oportunidade identificada está no espaço que as soluções completas deixam: uma ferramenta enxuta, que resolve bem uma única dor, a de marcar horário sem conflito."));
c.push(tit("2.5 Partes interessadas e relação de influência"));
c.push(legenda("Quadro 2 – Partes interessadas (stakeholders)"));
c.push(tabela([2.3, 3.7, 1.4, 1.6], ["Parte interessada", "Interesse no produto", "Influência", "Interesse"], [
  ["Cliente final", "Marcar horário rápido e com certeza de disponibilidade", "Média", "Alto"],
  ["Profissional / proprietário", "Agenda organizada, sem conflitos e sem interromper o atendimento", "Alta", "Alto"],
  ["Equipe de desenvolvimento", "Entregar um sistema funcional, testável e documentado", "Alta", "Alto"],
  ["Professor e tutoria", "Avaliar a aderência técnica e a qualidade dos artefatos", "Alta", "Médio"],
  ["Provedor de hospedagem", "Fornecer o ambiente de execução (fase futura)", "Baixa", "Baixo"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(body("O profissional é a parte de maior poder decisório, pois é ele quem adota ou rejeita a ferramenta. O cliente tem influência média: se o processo for difícil, desiste e volta ao contato manual. Por isso as duas personas da seção 3 representam esses dois papéis."));
c.push(tit("2.6 Requisitos principais"));
c.push(legenda("Quadro 3 – Requisitos funcionais e não funcionais"));
c.push(tabela([0.9, 5.6, 2.5], ["Código", "Descrição", "Tipo"], [
  ["RF01", "Listar os serviços com duração e preço", "Funcional"],
  ["RF02", "Calcular os horários livres de um serviço em uma data, considerando a duração e os agendamentos existentes", "Funcional"],
  ["RF03", "Criar agendamento com nome e telefone, recusando horários já ocupados", "Funcional"],
  ["RF04", "Listar os agendamentos de um dia, em ordem de horário", "Funcional"],
  ["RF05", "Cancelar um agendamento", "Funcional"],
  ["RNF01", "A interface deve funcionar em telas de celular", "Usabilidade"],
  ["RNF02", "Toda validação deve ser refeita no servidor", "Segurança / integridade"],
  ["RNF03", "O sistema deve ser executado com um único comando, criando o banco automaticamente", "Portabilidade"],
]));
c.push(fonte("elaborado pelo autor (2026)."));

c.push(tit("3 PERSONAS"));
c.push(body("As personas abaixo são fictícias, construídas a partir do perfil esperado dos usuários, e orientam as decisões de interface e de regra de negócio."));
c.push(legenda("Quadro 4 – Persona 1: Carlos Souza (cliente)"));
c.push(tabela([2, 6.5], ["Atributo", "Descrição"], [
  ["Perfil", "28 anos, analista administrativo, mora com a família"],
  ["Contexto", "Trabalha em horário comercial e usa o celular para quase tudo. Corta o cabelo a cada três semanas."],
  ["Objetivo", "Marcar horário em poucos toques, sem precisar ligar durante o expediente"],
  ["Frustrações", "Esperar resposta de mensagem; chegar e descobrir que o horário foi marcado para outra pessoa; não saber quanto o serviço dura"],
  ["Expectativa em relação ao produto", "Ver só horários livres e receber confirmação imediata"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(legenda("Quadro 5 – Persona 2: Marina Alves (profissional)"));
c.push(tabela([2, 6.5], ["Atributo", "Descrição"], [
  ["Perfil", "41 anos, proprietária de um pequeno salão com uma cadeira"],
  ["Contexto", "Atende o dia todo e controla a agenda em um caderno e em conversas de mensagens"],
  ["Objetivo", "Ter a agenda do dia organizada e evitar dois clientes no mesmo horário"],
  ["Frustrações", "Interromper o atendimento para responder; erros de anotação; clientes que somem sem avisar"],
  ["Expectativa em relação ao produto", "Abrir uma tela e ver o dia inteiro, e poder cancelar com um toque"],
]));
c.push(fonte("elaborado pelo autor (2026)."));

c.push(tit("4 JORNADA DO USUÁRIO"));
c.push(body("A jornada mapeada é a do cliente, representado por Carlos, ao agendar um serviço. Ela foi escolhida como jornada-chave da PoC por ser a de maior risco técnico: concentra a regra de negócio de horários livres e a validação de conflitos. O Quadro 6 detalha cada etapa."));
c.push(legenda("Quadro 6 – Jornada de Carlos: agendar um corte de cabelo"));
c.push(tabela([1.3, 2.1, 1.9, 2.1, 2.2], ["Etapa", "Ação", "Sentimento", "Ponto de dor atual", "Resposta do sistema"], [
  ["1. Descobrir", "Decide marcar o corte e abre o endereço do salão", "Neutro", "Não sabe se o salão aceita agendamento online", "Página inicial direta, sem cadastro"],
  ["2. Escolher serviço", "Vê a lista e escolhe \"Corte de cabelo\"", "Seguro", "Não sabe duração nem preço", "Cartões com duração e preço"],
  ["3. Escolher horário", "Seleciona o dia e um horário livre", "Ansioso", "Não sabe o que está livre", "Só horários livres e compatíveis com a duração"],
  ["4. Informar dados", "Digita nome e telefone", "Impaciente", "Formulários longos", "Apenas dois campos, com validação"],
  ["5. Confirmar", "Toca em \"Confirmar agendamento\"", "Receoso", "Medo de o horário ser ocupado nesse intervalo", "Verifica de novo no servidor; avisa se houve conflito"],
  ["6. Receber confirmação", "Lê a tela de confirmação", "Aliviado", "Incerteza se foi marcado", "Mensagem com serviço, data e horário"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(body("O ponto mais crítico está na etapa 5. Se dois clientes escolhem o mesmo horário quase ao mesmo tempo, o sistema precisa recusar o segundo sem perder o contexto, oferecendo novos horários. Esse comportamento foi implementado e testado na PoC."));

c.push(tit("5 PROVA DE CONCEITO (PoC)"));
c.push(tit("5.1 Definição da PoC"));
c.push(body("A PoC não é o aplicativo completo. Seguindo a orientação da disciplina, foi realizada a revisão do projeto para identificar o maior risco técnico. Entre os componentes do produto (catálogo, agenda, painel, cancelamento), o de maior risco é o cálculo de horários livres sem conflito, pois depende da duração variável dos serviços e precisa ser confiável mesmo com acessos simultâneos."));
c.push(body([run("Hipótese da PoC: ", { bold: true }), run("o sistema calcula corretamente os horários livres considerando a duração de cada serviço e nunca permite dois agendamentos sobrepostos.")]));
c.push(body([run("Critério de sucesso: ", { bold: true }), run("todos os testes automatizados da regra de agendamento passam, e o fluxo completo da jornada funciona no navegador, do primeiro passo à confirmação.")]));
c.push(body("A jornada implementada é a de Carlos (seção 4). O painel do profissional foi incluído apenas em versão básica, para visualizar e cancelar agendamentos."));
c.push(tit("5.2 Preparação do ambiente"));
c.push(legenda("Quadro 7 – Tecnologias utilizadas e justificativa"));
c.push(tabela([1.6, 2.6, 4.3], ["Camada", "Tecnologia", "Justificativa"], [
  ["Frontend", "HTML5, CSS3 e JavaScript", "Roda em qualquer navegador, inclusive no celular, sem etapa de compilação"],
  ["Backend", "C# com .NET 8 (ASP.NET Core Minimal API)", "Plataforma multiplataforma e de longo suporte; a Minimal API declara cada rota em poucas linhas, sem código de infraestrutura"],
  ["Banco de dados", "SQLite, acessado com Microsoft.Data.Sqlite", "Banco em arquivo, criado automaticamente, adequado ao porte da PoC; o SQL é escrito diretamente, sem ORM, deixando as consultas explícitas"],
  ["Testes", "xUnit", "Framework de testes padrão do ecossistema .NET"],
  ["Versionamento", "Git e GitHub", "Histórico de contribuições e entrega do código"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(body("O repositório foi organizado nas pastas backend-csharp (projeto da API e projeto de testes, reunidos na solução AgendaFacil.sln), frontend (interface) e docs (documentação e capturas de tela). As dependências são baixadas automaticamente pelo .NET na primeira execução, de modo que basta um único comando para iniciar o sistema em outro computador, que é justamente o que a PoC precisa demonstrar."));
c.push(body("O backend foi prototipado inicialmente em Python e depois reescrito em C#, mantendo exatamente o mesmo contrato de API, de forma que o frontend não precisou de nenhuma alteração. A versão em Python permanece na pasta backend apenas como referência."));
c.push(tit("5.3 Desenvolvimento do frontend"));
c.push(body("A interface segue a jornada em quatro etapas visíveis em uma barra de progresso: serviço, data e horário, dados e confirmação. O cliente avança com um toque em cada etapa e pode voltar. Os textos vindos do servidor são inseridos no documento como texto, e não como HTML, o que evita a injeção de código por dados de entrada. A Figura 1 mostra a tela inicial e a Figura 2, o painel do profissional."));
c.push(legenda("Figura 1 – Tela inicial da jornada do cliente"));
c.push(figura("fig_cliente.png", 13, 4.47));
c.push(fonte("captura de tela do AgendaFácil (2026)."));
c.push(legenda("Figura 2 – Painel do profissional"));
c.push(figura("fig_painel.png", 13, 4.84));
c.push(fonte("captura de tela do AgendaFácil (2026)."));
c.push(tit("5.4 Desenvolvimento do backend e dos dados"));
c.push(body("O banco possui duas tabelas relacionadas. O Quadro 8 resume o modelo de dados e o Quadro 9, a API."));
c.push(legenda("Quadro 8 – Modelo de dados"));
c.push(tabela([1.8, 4.4, 2.3], ["Tabela", "Campos", "Relação"], [
  ["servicos", "id, nome, duracao_min, preco", "1 serviço : N agendamentos"],
  ["agendamentos", "id, servico_id, data, inicio_min, fim_min, cliente_nome, cliente_telefone, criado_em", "N agendamentos : 1 serviço (chave estrangeira servico_id)"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(legenda("Quadro 9 – Rotas da API"));
c.push(tabela([0.9, 3.3, 4.3], ["Método", "Rota", "Função"], [
  ["GET", "/api/servicos", "Lista os serviços"],
  ["GET", "/api/horarios?servico_id=&data=", "Horários livres do serviço na data"],
  ["POST", "/api/agendamentos", "Cria o agendamento (201) ou informa conflito (409)"],
  ["GET", "/api/agendamentos?data=", "Lista os agendamentos do dia"],
  ["DELETE", "/api/agendamentos/{id}", "Cancela o agendamento"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(body("A regra central considera que dois intervalos se sobrepõem quando o início de um é anterior ao fim do outro e o fim do primeiro é posterior ao início do segundo. Um horário só é oferecido se o serviço inteiro cabe no expediente (09h00 às 18h00, em blocos de 30 minutos), não colide com nenhum agendamento e não está no passado. Essa verificação é refeita no momento da gravação, de modo que, se outra pessoa ocupou o horário no intervalo, o servidor responde com conflito e a interface devolve o cliente à escolha de horário."));
c.push(body("A regra de negócio fica isolada na classe Agenda, que não depende de HTTP; as rotas da API apenas convertem as requisições e repassam a ela. A verificação de conflito e a gravação são executadas dentro de uma única transação do banco: se duas confirmações para o mesmo horário chegarem ao mesmo tempo, a segunda aguarda a primeira terminar e, ao verificar novamente, já encontra o horário ocupado e recebe a resposta de conflito."));
c.push(tit("5.5 Testes e resultados"));
c.push(body("Foram escritos dez testes automatizados com xUnit para a regra de agendamento, e todos passaram. Eles cobrem: agenda vazia com 18 horários livres para serviço de 30 minutos; criação válida; recusa de horário idêntico; bloqueio de horários sobrepostos por serviço longo; limite do fim do expediente; remoção do horário anterior que invadiria um agendamento existente; validação de entradas inválidas; exclusão de horários passados no dia atual; ordenação da listagem; e concorrência, em que vinte confirmações simultâneas para o mesmo horário resultam em exatamente um agendamento gravado e dezenove recusas. Cada teste usa um banco SQLite temporário e independente."));
c.push(body("Além dos testes, o servidor foi executado e a API foi exercitada por requisições reais: a criação de um agendamento retornou código 201, uma segunda tentativa no mesmo horário retornou 409 com mensagem ao cliente, a listagem refletiu o agendamento e o cancelamento retornou 200. Também foi verificado que a tentativa de acessar arquivos fora da pasta do frontend retorna 404. O critério de sucesso definido na seção 5.1 foi atendido, e a hipótese da PoC foi confirmada."));
c.push(tit("5.6 Repositório no GitHub"));
c.push(body("Todo o código-fonte foi organizado para publicação em um repositório do GitHub, com histórico de contribuições e um arquivo README.md contendo a descrição do projeto, as tecnologias, o passo a passo de execução, a descrição da API e a execução dos testes. Para executar, basta ter o .NET 8 SDK instalado, clonar o repositório e rodar o comando dotnet run --project backend-csharp/AgendaFacil.Api; a interface fica disponível em http://localhost:8000. Os testes são executados com o comando dotnet test."));
c.push(body([run("Endereço do repositório: ", { bold: true }), run("https://github.com/moura001/agendafacil")]));
c.push(tit("5.7 Vídeo de demonstração"));
c.push(body("O vídeo de demonstração tem no máximo um minuto e mostra o projeto em funcionamento, seguindo o roteiro do Quadro 10."));
c.push(legenda("Quadro 10 – Roteiro do vídeo"));
c.push(tabela([1.4, 7.1], ["Tempo", "Conteúdo"], [
  ["0–5 s", "Apresentação: nome do projeto, nome do aluno e o problema que resolve"],
  ["5–15 s", "Escolha do serviço e da data; exibição dos horários livres"],
  ["15–30 s", "Preenchimento dos dados e confirmação do agendamento"],
  ["30–45 s", "Painel do profissional: o horário recém-marcado aparece na agenda"],
  ["45–55 s", "Tentativa de marcar o mesmo horário: sistema recusa e pede outro"],
  ["55–60 s", "Fechamento e menção ao repositório no GitHub"],
]));
c.push(fonte("elaborado pelo autor (2026)."));
c.push(body([run("Link do vídeo: ", { bold: true }), run("[COLAR AQUI O LINK PRIVADO DO YOUTUBE OU O CAMINHO DO MP4 NO GITHUB]")]));

c.push(tit("6 CONSIDERAÇÕES FINAIS"));
c.push(body("Este trabalho percorreu o caminho que a disciplina propõe: da ideia à prática. Na primeira etapa, o problema foi delimitado, as soluções existentes foram analisadas e dois usuários foram descritos em personas, dando base à jornada de agendamento. Na segunda etapa, a parte de maior risco dessa jornada foi implementada como PoC, com frontend, backend, banco de dados e testes automatizados."));
c.push(body("A PoC confirmou a hipótese de que é possível calcular horários livres de forma confiável e impedir sobreposições. Como limitações, o sistema não possui autenticação no painel do profissional, lembretes automáticos nem suporte a vários profissionais. Esses itens são os próximos passos naturais para evoluir a PoC até um produto utilizável em um estabelecimento real."));

c.push(tit("REFERÊNCIAS"));
const ref = (partes) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 240, after: 240 }, children: partes });
const rn = (t) => run(t, {});
const rb = (t) => run(t, { bold: true });
c.push(ref([rn("BOOKSY. "), rb("Sobre o Booksy"), rn(". [S. l.]: Booksy, [s.d.a]. Disponível em: https://biz.booksy.com/pt-br/sobre-nos. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("BOOKSY. "), rb("Agendamento online"), rn(". [S. l.]: Booksy, [s.d.b]. Disponível em: https://biz.booksy.com/pt-br/por-que-o-booksy. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("CAPTERRA. "), rb("Trinks"), rn(". [S. l.]: Capterra, [s.d.]. Disponível em: https://www.capterra.com/p/252863/Trinks/. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("MICROSOFT. "), rb("Minimal APIs overview"), rn(". Microsoft Learn. [S. l.]: Microsoft, [s.d.a]. Disponível em: https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/overview. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("MICROSOFT. "), rb("Microsoft.Data.Sqlite overview"), rn(". Microsoft Learn. [S. l.]: Microsoft, [s.d.b]. Disponível em: https://learn.microsoft.com/dotnet/standard/data/sqlite/. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("SENAC EAD. "), rb("Projeto Integrador: desenvolvimento de sistemas orientado a dispositivos móveis e baseados na web"), rn(". 1ª e 2ª etapas. Material de aula. [S. l.]: Senac EAD, 2026.")]));
c.push(ref([rn("SQLITE. "), rb("SQLite documentation"), rn(". [S. l.]: SQLite, [s.d.]. Disponível em: https://www.sqlite.org/docs.html. Acesso em: 21 nov. 2026.")]));
c.push(ref([rn("TRINKS. "), rb("Trinks.com"), rn(". Aplicativo. [S. l.]: Trinks, [s.d.]. Disponível em: https://apps.apple.com/ng/app/trinks-com/id628518776. Acesso em: 21 nov. 2026.")]));

// ---------- documento
const pg = { size: { width: 11906, height: 16838 }, margin: { top: 1701, left: 1701, right: 1134, bottom: 1134 } };
const doc = new Document({
  creator: "AgendaFácil", title: "AgendaFácil – Projeto Integrador",
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 360, after: 360 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 240 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "marcador", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1134, hanging: 425 } } } }] }] },
  sections: [
    { properties: { page: pg }, children: capa },
    {
      properties: { page: pg },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] }) },
      children: [...sumario, new Paragraph({ children: [new PageBreak()] }), ...c],
    },
  ],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(path.join(__dirname, "AgendaFacil_Projeto_Integrador.docx"), b); console.log("docx gerado"); });
