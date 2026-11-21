using Microsoft.Data.Sqlite;

namespace AgendaFacil.Api;

/// <summary>
/// Acesso ao banco SQLite (arquivo único, criado automaticamente).
/// Usa SQL direto com Microsoft.Data.Sqlite, sem Entity Framework.
/// </summary>
public sealed class Banco
{
    // Carga inicial: nome, duração em minutos e preço.
    private static readonly (string Nome, int DuracaoMin, double Preco)[] ServicosIniciais =
    [
        ("Corte de cabelo", 30, 40.0),
        ("Barba", 30, 30.0),
        ("Corte + Barba", 60, 65.0),
        ("Coloração", 90, 120.0),
    ];

    private readonly string _connectionString;

    public Banco(string caminhoArquivo)
    {
        var caminho = Path.GetFullPath(caminhoArquivo);
        Directory.CreateDirectory(Path.GetDirectoryName(caminho)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = caminho,
            Mode = SqliteOpenMode.ReadWriteCreate, // cria o arquivo se não existir
            ForeignKeys = true,                    // equivale a PRAGMA foreign_keys = ON
        }.ToString();
    }

    /// <summary>Abre uma nova conexão (quem chama deve descartá-la com using).</summary>
    public SqliteConnection Conectar()
    {
        var con = new SqliteConnection(_connectionString);
        con.Open();
        return con;
    }

    /// <summary>Cria as tabelas (se ainda não existem) e insere os serviços de exemplo.</summary>
    public void Iniciar()
    {
        using var con = Conectar();

        Executar(con, """
            CREATE TABLE IF NOT EXISTS servicos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                duracao_min INTEGER NOT NULL,
                preco REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agendamentos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                servico_id INTEGER NOT NULL REFERENCES servicos(id),
                data TEXT NOT NULL,          -- AAAA-MM-DD
                inicio_min INTEGER NOT NULL, -- minutos desde 00:00
                fim_min INTEGER NOT NULL,
                cliente_nome TEXT NOT NULL,
                cliente_telefone TEXT NOT NULL,
                criado_em TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agend_data ON agendamentos(data);
            """);

        using var contar = con.CreateCommand();
        contar.CommandText = "SELECT COUNT(*) FROM servicos";
        if ((long)contar.ExecuteScalar()! > 0)
            return; // banco já populado

        using var transacao = con.BeginTransaction();
        foreach (var (nome, duracao, preco) in ServicosIniciais)
        {
            using var inserir = con.CreateCommand();
            inserir.CommandText = "INSERT INTO servicos (nome, duracao_min, preco) VALUES ($nome, $duracao, $preco)";
            inserir.Parameters.AddWithValue("$nome", nome);
            inserir.Parameters.AddWithValue("$duracao", duracao);
            inserir.Parameters.AddWithValue("$preco", preco);
            inserir.ExecuteNonQuery();
        }
        transacao.Commit();
    }

    private static void Executar(SqliteConnection con, string sql)
    {
        using var cmd = con.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }
}
