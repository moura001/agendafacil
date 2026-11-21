// AgendaFácil - backend da Prova de Conceito (PoC) em C# / ASP.NET Core Minimal API.
// Expõe a API JSON e também serve os arquivos do frontend.
//
// Execução:  dotnet run --project backend-csharp/AgendaFacil.Api  ->  http://localhost:8000

using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using AgendaFacil.Api;
using Microsoft.AspNetCore.Mvc;

Console.OutputEncoding = Encoding.UTF8;

var frontend = Frontend.Localizar();
var raiz = Path.GetDirectoryName(frontend.Pasta)!;
var caminhoBanco = Environment.GetEnvironmentVariable("AGENDA_DB")
                   ?? Path.Combine(raiz, "backend-csharp", "agenda.db");
var porta = int.Parse(Environment.GetEnvironmentVariable("PORT") ?? "8000");

var banco = new Banco(caminhoBanco);
banco.Iniciar(); // cria tabelas e serviços de exemplo na primeira execução

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://0.0.0.0:{porta}"); // 0.0.0.0: acessível pelo celular na mesma rede
builder.Logging.AddFilter("Microsoft", LogLevel.Warning);
builder.Services.AddSingleton(new Agenda(banco));
builder.Services.ConfigureHttpJsonOptions(o =>
{
    // Campos em snake_case (servico_id, duracao_min), como no backend Python.
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    // Não escapa acentos nem "+" ("Coloração" sai como está, não "Coloração").
    // Seguro aqui: as respostas são application/json e o frontend usa textContent.
    o.SerializerOptions.Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
});

var app = builder.Build();

// Log simples de cada requisição: [HH:mm:ss] MÉTODO /caminho STATUS
app.Use(async (ctx, next) =>
{
    await next();
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {ctx.Request.Method} {ctx.Request.Path}{ctx.Request.QueryString} {ctx.Response.StatusCode}");
});

// ------------------------------------------------------------------ API
app.MapGet("/api/servicos", (Agenda agenda) => Results.Json(agenda.ListarServicos()));

app.MapGet("/api/horarios", ([FromQuery(Name = "servico_id")] string? servicoId, string? data, Agenda agenda) =>
{
    var dataIso = Agenda.ValidarData(data);
    if (dataIso is null)
        return Erro(400, "Data inválida.");
    if (!long.TryParse(servicoId, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id))
        return Erro(400, "Serviço inválido.");
    var livres = agenda.HorariosLivres(id, dataIso);
    if (livres is null)
        return Erro(404, "Serviço não encontrado.");
    return Results.Json(new { data = dataIso, livres });
});

app.MapPost("/api/agendamentos", async (HttpRequest req, Agenda agenda) =>
{
    // Lê o corpo manualmente para responder "JSON inválido." com a mesma
    // mensagem do Python (corpo vazio é tratado como {}).
    using var leitor = new StreamReader(req.Body, Encoding.UTF8);
    var corpo = await leitor.ReadToEndAsync();
    JsonDocument doc;
    try
    {
        doc = JsonDocument.Parse(corpo.Length == 0 ? "{}" : corpo);
    }
    catch (JsonException)
    {
        return Erro(400, "JSON inválido.");
    }
    using (doc)
    {
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
            return Erro(400, "JSON inválido.");
        var resultado = agenda.CriarAgendamento(DadosAgendamento.DeJson(doc.RootElement));
        return resultado.Status == 201
            ? Results.Json(resultado.Agendamento, statusCode: 201)
            : Erro(resultado.Status, resultado.Erro!);
    }
});

app.MapGet("/api/agendamentos", (string? data, Agenda agenda) =>
{
    var dataIso = string.IsNullOrEmpty(data) ? Agenda.Hoje() : data; // padrão: hoje
    if (!Agenda.EhDataIso(dataIso))
        return Erro(400, "Data inválida.");
    return Results.Json(agenda.ListarAgendamentos(dataIso));
});

app.MapDelete("/api/agendamentos/{id}", (string id, Agenda agenda) =>
{
    if (!Regex.IsMatch(id, @"\A\d+\z"))
        return Erro(404, "Rota não encontrada.");
    if (!long.TryParse(id, out var numero) || !agenda.Cancelar(numero))
        return Erro(404, "Agendamento não encontrado.");
    return Results.Json(new { ok = true });
});

// -------------------------------------------- frontend e rotas inexistentes
// Captura tudo que não casou com as rotas acima (qualquer método).
app.Map("/{**caminho}", (HttpContext ctx) =>
{
    var metodo = ctx.Request.Method;
    var caminho = ctx.Request.Path.Value ?? "/";
    if (HttpMethods.IsGet(metodo) && !caminho.StartsWith("/api/"))
        return frontend.Servir(caminho);
    if (HttpMethods.IsGet(metodo) || HttpMethods.IsPost(metodo) || HttpMethods.IsDelete(metodo))
        return Erro(404, "Rota não encontrada.");
    return Results.StatusCode(501); // métodos não suportados (o Python também responde 501)
});

Console.WriteLine($"AgendaFácil rodando em http://localhost:{porta}  (Ctrl+C para parar)");
app.Run();

static IResult Erro(int status, string mensagem) =>
    Results.Json(new { erro = mensagem }, statusCode: status);
