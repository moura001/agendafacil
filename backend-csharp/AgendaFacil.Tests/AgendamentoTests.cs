using AgendaFacil.Api;
using Microsoft.Data.Sqlite;

namespace AgendaFacil.Tests;

/// <summary>
/// Testes da regra de negócio central da PoC: agendar sem conflito de horário.
/// Porte dos 9 testes de backend/test_api.py, mais um teste de concorrência
/// (confirmações simultâneas). Cada teste usa um banco novo
/// em uma pasta temporária.
/// </summary>
public sealed class AgendamentoTests : IDisposable
{
    private readonly string _pasta;
    private readonly Agenda _agenda;
    private readonly string _amanha = DateTime.Today.AddDays(1).ToString("yyyy-MM-dd");

    public AgendamentoTests()
    {
        _pasta = Directory.CreateTempSubdirectory("agendafacil-teste-").FullName;
        var banco = new Banco(Path.Combine(_pasta, "teste.db"));
        banco.Iniciar();
        _agenda = new Agenda(banco);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools(); // libera o arquivo para poder apagá-lo no Windows
        Directory.Delete(_pasta, recursive: true);
    }

    // Dados válidos padrão; cada teste altera só o que interessa.
    private DadosAgendamento Dados(string servicoId = "1", string? data = null, string hora = "10:00",
                                   string nome = "Carlos Souza", string telefone = "(11) 91234-5678")
        => new(servicoId, data ?? _amanha, hora, nome, telefone);

    [Fact]
    public void AgendaVazia_TemTodosOsHorarios()
    {
        var livres = _agenda.HorariosLivres(1, _amanha)!;
        Assert.Equal("09:00", livres[0]);
        Assert.Equal("17:30", livres[^1]);
        Assert.Equal(18, livres.Count);
    }

    [Fact]
    public void CriaAgendamentoValido()
    {
        var resultado = _agenda.CriarAgendamento(Dados());
        Assert.Equal(201, resultado.Status);
        Assert.Equal("10:00", resultado.Agendamento!.Inicio);
        Assert.Equal("10:30", resultado.Agendamento.Fim);
    }

    [Fact]
    public void MesmoHorario_GeraConflito()
    {
        _agenda.CriarAgendamento(Dados());
        var resultado = _agenda.CriarAgendamento(Dados(nome: "Outra Pessoa"));
        Assert.Equal(409, resultado.Status);
    }

    [Fact]
    public void ServicoLongo_BloqueiaHorariosSobrepostos()
    {
        // Coloração (90 min) às 10:00 ocupa até 11:30
        _agenda.CriarAgendamento(Dados(servicoId: "4"));
        var livres = _agenda.HorariosLivres(1, _amanha)!;
        foreach (var h in new[] { "10:00", "10:30", "11:00" })
            Assert.DoesNotContain(h, livres);
        Assert.Contains("11:30", livres);
        Assert.Contains("09:30", livres);
    }

    [Fact]
    public void Servico_NaoPodeUltrapassarOFechamento()
    {
        var livres = _agenda.HorariosLivres(4, _amanha)!; // 90 min
        Assert.Equal("16:30", livres[^1]);
    }

    [Fact]
    public void HorarioAnteriorQueInvadeOOcupado_ERemovido()
    {
        _agenda.CriarAgendamento(Dados(hora: "10:00"));
        var livres = _agenda.HorariosLivres(3, _amanha)!; // 60 min
        Assert.DoesNotContain("09:30", livres); // 09:30-10:30 invadiria 10:00
        Assert.Contains("09:00", livres);
    }

    [Fact]
    public void Validacoes()
    {
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(nome: "")).Status);
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(telefone: "123")).Status);
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(data: "2000-01-01")).Status);
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(hora: "25:99x")).Status);
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(servicoId: "abc")).Status);
        Assert.Equal(400, _agenda.CriarAgendamento(Dados(servicoId: "99")).Status);
    }

    [Fact]
    public void HorariosPassadosDeHoje_NaoAparecem()
    {
        var hoje = DateTime.Today.ToString("yyyy-MM-dd");
        var meioDia = DateTime.Today.AddHours(12);
        var livres = _agenda.HorariosLivres(1, hoje, agora: meioDia)!;
        Assert.All(livres, h => Assert.True(string.CompareOrdinal(h, "12:00") > 0));
    }

    [Fact]
    public async Task ConfirmacoesSimultaneas_SoUmaGanhaOHorario()
    {
        // 20 clientes confirmam o mesmo horário ao mesmo tempo, cada um com sua conexão.
        var tarefas = Enumerable.Range(1, 20)
            .Select(i => Task.Run(() => _agenda.CriarAgendamento(Dados(nome: $"Cliente {i}"))));
        var resultados = await Task.WhenAll(tarefas);

        Assert.Single(resultados, r => r.Status == 201);
        Assert.Equal(19, resultados.Count(r => r.Status == 409));
        Assert.Single(_agenda.ListarAgendamentos(_amanha));
    }

    [Fact]
    public void Listagem_OrdenadaPorHorario()
    {
        _agenda.CriarAgendamento(Dados(hora: "15:00"));
        _agenda.CriarAgendamento(Dados(hora: "09:00", nome: "Ana Lima"));
        var lista = _agenda.ListarAgendamentos(_amanha);
        Assert.Equal(new[] { "09:00", "15:00" }, lista.Select(a => a.Inicio));
    }
}
