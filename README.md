# AgendaFácil

Prova de Conceito (PoC) do **Projeto Integrador: Desenvolvimento de Sistemas Orientado a Dispositivos Móveis e Baseados na Web** (SENAC EAD – TADS/TSI).

O AgendaFácil permite que o cliente de um salão ou barbearia **agende um horário sozinho, em poucos passos, sem conflito com outros agendamentos**, e que o profissional acompanhe e cancele os horários do dia.

## Jornada validada na PoC

**Cliente agenda um serviço:** escolher serviço → escolher data e horário livre → informar nome e telefone → receber a confirmação.

**Hipótese da PoC:** o sistema calcula corretamente os horários livres considerando a duração de cada serviço e **nunca permite dois agendamentos sobrepostos**. Isso é verificado por testes automatizados (`backend-csharp/AgendaFacil.Tests`).

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3 e JavaScript puro (responsivo, usável no celular) |
| Backend | C# / .NET 8 – ASP.NET Core Minimal API |
| Banco de dados | SQLite via `Microsoft.Data.Sqlite` (SQL direto, sem Entity Framework; arquivo criado automaticamente) |
| Testes | xUnit |

As dependências (pacotes NuGet) são baixadas automaticamente pelo `dotnet` na primeira compilação.

## Como executar

Pré-requisito: **.NET 8 SDK** instalado (`dotnet --list-sdks`). Um SDK mais novo também funciona, desde que o runtime do .NET 8 esteja instalado.

```bash
# 1. Baixe o projeto
git clone <URL-DO-REPOSITORIO>
cd agendafacil

# 2. Inicie o servidor (cria o banco e os serviços de exemplo sozinho)
dotnet run --project backend-csharp/AgendaFacil.Api
```

3. Abra no navegador: **http://localhost:8000**
   - Aba **Agendar**: jornada do cliente.
   - Aba **Painel do profissional**: lista e cancela agendamentos do dia.

Para usar outra porta: `PORT=9000 dotnet run --project backend-csharp/AgendaFacil.Api` (Linux/macOS) ou `set PORT=9000 && dotnet run --project backend-csharp/AgendaFacil.Api` (Windows CMD).

O banco fica em `backend-csharp/agenda.db` (pode ser trocado pela variável de ambiente `AGENDA_DB`).

Para testar pelo celular na mesma rede Wi-Fi, abra `http://<IP-DO-COMPUTADOR>:8000`.

## Como rodar os testes

```bash
dotnet test
```

Cobrem: agenda vazia, conflito de horário, serviços longos bloqueando horários sobrepostos, limite do expediente, validação de entradas, horários passados, ordenação e confirmações simultâneas do mesmo horário.

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/servicos` | Lista os serviços |
| GET | `/api/horarios?servico_id=1&data=AAAA-MM-DD` | Horários livres para o serviço na data |
| POST | `/api/agendamentos` | Cria agendamento (`201`), dados inválidos (`400`) ou conflito (`409`) |
| GET | `/api/agendamentos?data=AAAA-MM-DD` | Lista agendamentos do dia |
| DELETE | `/api/agendamentos/{id}` | Cancela um agendamento (`200`) ou `404` se não existe |

Exemplo de criação:

```bash
curl -X POST http://localhost:8000/api/agendamentos \
  -H "Content-Type: application/json" \
  -d '{"servico_id":1,"data":"2026-12-01","hora":"10:00","nome":"Carlos Souza","telefone":"11912345678"}'
```

## Estrutura

```
agendafacil/
├── AgendaFacil.sln               # solution .NET (API + testes)
├── backend-csharp/
│   ├── AgendaFacil.Api/
│   │   ├── Program.cs            # configuração, rotas da API e servidor de arquivos
│   │   ├── Agenda.cs             # regras de negócio (horários livres, criação, listagem)
│   │   ├── Banco.cs              # criação do banco SQLite e carga inicial
│   │   ├── Frontend.cs           # entrega dos arquivos de frontend/
│   │   └── Modelos.cs            # registros que viram JSON
│   └── AgendaFacil.Tests/
│       └── AgendamentoTests.cs   # testes automatizados (xUnit)
├── backend/                      # versão original em Python (mantida como referência)
│   ├── server.py
│   └── test_api.py
├── frontend/
│   ├── index.html                # telas
│   ├── style.css                 # estilos
│   └── app.js                    # lógica da interface
├── docs/                         # documento da entrega e capturas de tela
└── README.md
```

## Regras de negócio

- Expediente: 09:00–18:00, agenda em blocos de 30 minutos.
- Um horário só é oferecido se o serviço inteiro cabe no expediente e não sobrepõe outro agendamento (sobreposição: início < fim do existente **e** fim > início do existente).
- Não é possível agendar no passado nem a mais de 60 dias.
- Nome com pelo menos 2 caracteres; telefone com DDD (10 ou 11 dígitos).
- A checagem de conflito é refeita no servidor no momento da confirmação; se alguém ocupou o horário antes, o cliente é avisado e volta à escolha de horário. A checagem e a gravação acontecem dentro de uma única transação, então duas confirmações simultâneas nunca ocupam o mesmo horário.

## Versão original em Python

A primeira versão do backend, em Python puro, continua em `backend/` e expõe exatamente a mesma API. Para usá-la (requer Python 3.10+):

```bash
python backend/server.py            # servidor em http://localhost:8000
python -m unittest backend/test_api.py -v
```

## Limitações da PoC (próximos passos)

- Sem login: o painel do profissional é aberto (em produção, exigir autenticação).
- Sem envio de lembretes por WhatsApp/SMS.
- Um único profissional e um único expediente fixo.

## Integrante

- Marcelo Moura
