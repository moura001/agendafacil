using System.Globalization;
using System.Text.Json;

namespace AgendaFacil.Api;

// Registros (records) que viram JSON. Com a política SnakeCaseLower,
// DuracaoMin vira "duracao_min", ServicoId vira "servico_id" etc.

public sealed record Servico(long Id, string Nome, long DuracaoMin, double Preco);

/// <summary>Resposta do POST /api/agendamentos (201).</summary>
public sealed record AgendamentoCriado(
    long Id, string Servico, string Data, string Inicio, string Fim, string Cliente);

/// <summary>Item da listagem GET /api/agendamentos.</summary>
public sealed record AgendamentoListado(
    long Id, string Data, string Inicio, string Fim, string Cliente, string Telefone, string Servico);

/// <summary>Resultado da criação: 201 com o agendamento, ou 400/409 com a mensagem de erro.</summary>
public sealed record ResultadoCriacao(int Status, AgendamentoCriado? Agendamento, string? Erro)
{
    public static ResultadoCriacao Criado(AgendamentoCriado agendamento) => new(201, agendamento, null);
    public static ResultadoCriacao Falha(int status, string erro) => new(status, null, erro);
}

/// <summary>
/// Dados enviados pelo cliente para criar um agendamento.
/// Tudo chega como texto para a validação ficar na regra de negócio
/// (assim o servico_id pode vir como 1 ou "1", igual ao backend Python).
/// </summary>
public sealed record DadosAgendamento(
    string? ServicoId, string? Data, string? Hora, string? Nome, string? Telefone)
{
    /// <summary>Converte o objeto JSON recebido no corpo do POST.</summary>
    public static DadosAgendamento DeJson(JsonElement obj) => new(
        ServicoIdComoTexto(obj),
        Texto(obj, "data"),
        Texto(obj, "hora"),
        Texto(obj, "nome"),
        Texto(obj, "telefone"));

    // Campos de texto: qualquer outro tipo JSON é tratado como ausente.
    private static string? Texto(JsonElement obj, string campo) =>
        obj.TryGetProperty(campo, out var valor) && valor.ValueKind == JsonValueKind.String
            ? valor.GetString()
            : null;

    // servico_id aceita número (1, ou 1.0 truncado como o int() do Python) ou texto ("1").
    private static string? ServicoIdComoTexto(JsonElement obj)
    {
        if (!obj.TryGetProperty("servico_id", out var valor))
            return null;
        return valor.ValueKind switch
        {
            JsonValueKind.String => valor.GetString(),
            JsonValueKind.Number => Math.Truncate(valor.GetDouble()).ToString(CultureInfo.InvariantCulture),
            _ => null,
        };
    }
}
