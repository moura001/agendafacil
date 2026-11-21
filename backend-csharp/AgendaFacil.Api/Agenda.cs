using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace AgendaFacil.Api;

/// <summary>
/// Regras de negócio do AgendaFácil: horários livres, criação, listagem e
/// cancelamento de agendamentos. Não depende de HTTP, por isso os testes
/// usam esta classe diretamente com um banco SQLite temporário.
/// </summary>
public sealed class Agenda
{
    public const string Abertura = "09:00";
    public const string Fechamento = "18:00";
    public const int PassoMin = 30;      // granularidade da agenda
    public const int DiasAFrente = 60;   // até quando é possível agendar

    private const string FormatoData = "yyyy-MM-dd";
    private static readonly CultureInfo Invariante = CultureInfo.InvariantCulture;

    private readonly Banco _banco;

    public Agenda(Banco banco) => _banco = banco;

    // ------------------------------------------------------------ serviços
    public List<Servico> ListarServicos()
    {
        using var con = _banco.Conectar();
        using var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT id, nome, duracao_min, preco FROM servicos ORDER BY id";
        using var r = cmd.ExecuteReader();
        var lista = new List<Servico>();
        while (r.Read())
            lista.Add(new Servico(r.GetInt64(0), r.GetString(1), r.GetInt64(2), r.GetDouble(3)));
        return lista;
    }

    // ----------------------------------------------------- horários livres
    /// <summary>
    /// Devolve os horários de início ("HH:MM") livres para o serviço na data,
    /// ou null se o serviço não existe. O parâmetro <paramref name="agora"/>
    /// permite simular o relógio nos testes.
    /// </summary>
    public List<string>? HorariosLivres(long servicoId, string dataIso, DateTime? agora = null)
    {
        using var con = _banco.Conectar();
        return HorariosLivres(con, servicoId, dataIso, agora);
    }

    private static List<string>? HorariosLivres(SqliteConnection con, long servicoId, string dataIso, DateTime? agora)
    {
        var servico = BuscarServico(con, servicoId);
        if (servico is null)
            return null;

        var momento = agora ?? DateTime.Now;
        int abre = HhmmParaMin(Abertura), fecha = HhmmParaMin(Fechamento);
        var ocupados = Ocupados(con, dataIso);
        var livres = new List<string>();

        // Testa cada início possível do expediente, de 30 em 30 minutos.
        for (var inicio = abre; inicio < fecha; inicio += PassoMin)
        {
            var fim = inicio + (int)servico.DuracaoMin;

            // Regra 1: o serviço inteiro precisa caber no expediente.
            if (fim > fecha)
                break;

            // Regra 2: não pode sobrepor outro agendamento. Dois intervalos se
            // sobrepõem quando um começa antes do outro terminar E termina
            // depois do outro começar.
            if (ocupados.Any(o => inicio < o.FimMin && fim > o.InicioMin))
                continue;

            // Regra 3: no dia de hoje, horários que já passaram não são oferecidos.
            if (dataIso == momento.ToString(FormatoData, Invariante)
                && inicio <= momento.Hour * 60 + momento.Minute)
                continue;

            livres.Add(MinParaHhmm(inicio));
        }
        return livres;
    }

    // ------------------------------------------------------------ criação
    /// <summary>
    /// Valida os dados e grava o agendamento. Retorna 201 (criado),
    /// 400 (dados inválidos) ou 409 (horário não está mais livre).
    /// </summary>
    public ResultadoCriacao CriarAgendamento(DadosAgendamento dados, DateTime? agora = null)
    {
        // Validações na mesma ordem do backend Python.
        var nome = (dados.Nome ?? "").Trim();
        var telefone = Regex.Replace(dados.Telefone ?? "", @"\D", ""); // só os dígitos

        if (nome.Length < 2)
            return ResultadoCriacao.Falha(400, "Informe seu nome.");
        if (telefone.Length is < 10 or > 11) // DDD + 8 ou 9 dígitos
            return ResultadoCriacao.Falha(400, "Telefone inválido. Use DDD + número.");
        if (!long.TryParse(dados.ServicoId, NumberStyles.Integer, Invariante, out var servicoId))
            return ResultadoCriacao.Falha(400, "Serviço inválido.");
        var dataIso = ValidarData(dados.Data);
        if (dataIso is null)
            return ResultadoCriacao.Falha(400, "Data inválida (use hoje até 60 dias à frente).");
        var hora = dados.Hora ?? "";
        if (!Regex.IsMatch(hora, @"\A\d{2}:\d{2}\z"))
            return ResultadoCriacao.Falha(400, "Horário inválido.");

        using var con = _banco.Conectar();

        // Transação IMMEDIATE: reserva a escrita no banco antes de checar o
        // conflito. Se duas pessoas confirmarem o mesmo horário ao mesmo tempo,
        // a segunda espera a primeira terminar e então já enxerga o horário
        // ocupado (recebe 409), em vez de as duas gravarem.
        using var transacao = con.BeginTransaction(deferred: false);

        // A checagem de conflito é refeita aqui, no momento da confirmação:
        // outra pessoa pode ter ocupado o horário depois que a lista foi exibida.
        var livres = HorariosLivres(con, servicoId, dataIso, agora);
        if (livres is null)
            return ResultadoCriacao.Falha(400, "Serviço não encontrado.");
        if (!livres.Contains(hora))
            return ResultadoCriacao.Falha(409, "Esse horário acabou de ser ocupado. Escolha outro.");

        var servico = BuscarServico(con, servicoId)!;
        var inicio = HhmmParaMin(hora);
        var fim = inicio + (int)servico.DuracaoMin;

        using var cmd = con.CreateCommand();
        cmd.CommandText = """
            INSERT INTO agendamentos (servico_id, data, inicio_min, fim_min,
                                      cliente_nome, cliente_telefone, criado_em)
            VALUES ($servico, $data, $inicio, $fim, $nome, $telefone, $criado);
            SELECT last_insert_rowid();
            """;
        cmd.Parameters.AddWithValue("$servico", servicoId);
        cmd.Parameters.AddWithValue("$data", dataIso);
        cmd.Parameters.AddWithValue("$inicio", inicio);
        cmd.Parameters.AddWithValue("$fim", fim);
        cmd.Parameters.AddWithValue("$nome", nome);
        cmd.Parameters.AddWithValue("$telefone", telefone);
        cmd.Parameters.AddWithValue("$criado", (agora ?? DateTime.Now).ToString("yyyy-MM-dd'T'HH:mm:ss", Invariante));
        var id = (long)cmd.ExecuteScalar()!;
        transacao.Commit(); // sem Commit, o using desfaz tudo (rollback)

        return ResultadoCriacao.Criado(new AgendamentoCriado(
            id, servico.Nome, dataIso, hora, MinParaHhmm(fim), nome));
    }

    // ------------------------------------------------ listagem/cancelamento
    /// <summary>Agendamentos do dia, ordenados pelo horário de início.</summary>
    public List<AgendamentoListado> ListarAgendamentos(string dataIso)
    {
        using var con = _banco.Conectar();
        using var cmd = con.CreateCommand();
        cmd.CommandText = """
            SELECT a.id, a.data, a.inicio_min, a.fim_min, a.cliente_nome,
                   a.cliente_telefone, s.nome AS servico
            FROM agendamentos a
            JOIN servicos s ON s.id = a.servico_id
            WHERE a.data = $data
            ORDER BY a.inicio_min
            """;
        cmd.Parameters.AddWithValue("$data", dataIso);
        using var r = cmd.ExecuteReader();
        var lista = new List<AgendamentoListado>();
        while (r.Read())
            lista.Add(new AgendamentoListado(
                Id: r.GetInt64(0),
                Data: r.GetString(1),
                Inicio: MinParaHhmm(r.GetInt32(2)),
                Fim: MinParaHhmm(r.GetInt32(3)),
                Cliente: r.GetString(4),
                Telefone: r.GetString(5),
                Servico: r.GetString(6)));
        return lista;
    }

    /// <summary>Cancela (apaga) o agendamento. Retorna false se o id não existe.</summary>
    public bool Cancelar(long id)
    {
        using var con = _banco.Conectar();
        using var cmd = con.CreateCommand();
        cmd.CommandText = "DELETE FROM agendamentos WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        return cmd.ExecuteNonQuery() > 0;
    }

    // ------------------------------------------------------------ apoio
    /// <summary>
    /// Aceita só datas AAAA-MM-DD entre hoje e 60 dias à frente.
    /// Retorna a data normalizada ou null se for inválida.
    /// </summary>
    public static string? ValidarData(string? texto)
    {
        if (!EhDataIso(texto, out var data))
            return null;
        var hoje = DateOnly.FromDateTime(DateTime.Today);
        if (data < hoje || data > hoje.AddDays(DiasAFrente))
            return null;
        return data.ToString(FormatoData, Invariante);
    }

    /// <summary>Só verifica o formato AAAA-MM-DD (sem limite de período).</summary>
    public static bool EhDataIso(string? texto) => EhDataIso(texto, out _);

    private static bool EhDataIso(string? texto, out DateOnly data) =>
        DateOnly.TryParseExact(texto, FormatoData, Invariante, DateTimeStyles.None, out data);

    public static string Hoje() => DateTime.Today.ToString(FormatoData, Invariante);

    /// <summary>"10:30" -> 630 (minutos desde 00:00).</summary>
    public static int HhmmParaMin(string hhmm)
    {
        var partes = hhmm.Split(':');
        return int.Parse(partes[0], Invariante) * 60 + int.Parse(partes[1], Invariante);
    }

    /// <summary>630 -> "10:30".</summary>
    public static string MinParaHhmm(int minutos) => $"{minutos / 60:00}:{minutos % 60:00}";

    private static Servico? BuscarServico(SqliteConnection con, long id)
    {
        using var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT id, nome, duracao_min, preco FROM servicos WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        using var r = cmd.ExecuteReader();
        return r.Read() ? new Servico(r.GetInt64(0), r.GetString(1), r.GetInt64(2), r.GetDouble(3)) : null;
    }

    private static List<(int InicioMin, int FimMin)> Ocupados(SqliteConnection con, string dataIso)
    {
        using var cmd = con.CreateCommand();
        cmd.CommandText = "SELECT inicio_min, fim_min FROM agendamentos WHERE data = $data";
        cmd.Parameters.AddWithValue("$data", dataIso);
        using var r = cmd.ExecuteReader();
        var lista = new List<(int, int)>();
        while (r.Read())
            lista.Add((r.GetInt32(0), r.GetInt32(1)));
        return lista;
    }
}
