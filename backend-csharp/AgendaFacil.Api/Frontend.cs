using Microsoft.AspNetCore.StaticFiles;

namespace AgendaFacil.Api;

/// <summary>
/// Serve os arquivos da pasta frontend/ (HTML, CSS, JS e imagens),
/// bloqueando qualquer caminho que aponte para fora dela.
/// </summary>
public sealed class Frontend
{
    private static readonly FileExtensionContentTypeProvider TiposMime = new();

    public string Pasta { get; }

    public Frontend(string pasta) => Pasta = Path.GetFullPath(pasta);

    /// <summary>
    /// Procura a pasta frontend/ subindo a partir da pasta do executável
    /// (bin/Debug/net8.0 -> ... -> raiz do repositório).
    /// Pode ser sobrescrita pela variável de ambiente FRONTEND_DIR.
    /// </summary>
    public static Frontend Localizar()
    {
        var configurada = Environment.GetEnvironmentVariable("FRONTEND_DIR");
        if (!string.IsNullOrEmpty(configurada))
            return new Frontend(configurada);

        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidata = Path.Combine(dir.FullName, "frontend");
            if (File.Exists(Path.Combine(candidata, "index.html")))
                return new Frontend(candidata);
        }
        throw new DirectoryNotFoundException("Pasta frontend/ não encontrada.");
    }

    public IResult Servir(string caminho)
    {
        if (caminho is "" or "/")
            caminho = "/index.html";

        // Resolve o caminho completo e confere se continua dentro de frontend/
        // (impede "../" e caminhos absolutos como /C:/Windows/...).
        var alvo = Path.GetFullPath(Path.Combine(Pasta, caminho.TrimStart('/')));
        var comparacao = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!alvo.StartsWith(Pasta + Path.DirectorySeparatorChar, comparacao) || !File.Exists(alvo))
            return Results.Json(new { erro = "Não encontrado." }, statusCode: 404);

        if (!TiposMime.TryGetContentType(alvo, out var tipo))
            tipo = "application/octet-stream";
        if (tipo.StartsWith("text") || tipo.EndsWith("javascript"))
            tipo += "; charset=utf-8";

        return Results.Bytes(File.ReadAllBytes(alvo), tipo);
    }
}
