"""AgendaFácil - backend da Prova de Conceito (PoC).

Servidor HTTP em Python puro (sem dependências externas) com banco SQLite.
Expõe uma API JSON e também serve os arquivos do frontend.

Execução:  python backend/server.py   ->  http://localhost:8000
"""
import json
import mimetypes
import os
import re
import sqlite3
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONT_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
DB_PATH = os.environ.get("AGENDA_DB", os.path.join(BASE_DIR, "agenda.db"))

ABERTURA = "09:00"
FECHAMENTO = "18:00"
PASSO_MIN = 30  # granularidade da agenda

SERVICOS_INICIAIS = [
    ("Corte de cabelo", 30, 40.0),
    ("Barba", 30, 30.0),
    ("Corte + Barba", 60, 65.0),
    ("Coloração", 90, 120.0),
]


# ----------------------------------------------------------------- banco
def conectar():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def iniciar_banco():
    con = conectar()
    con.executescript(
        """
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
        """
    )
    if con.execute("SELECT COUNT(*) FROM servicos").fetchone()[0] == 0:
        con.executemany(
            "INSERT INTO servicos (nome, duracao_min, preco) VALUES (?, ?, ?)",
            SERVICOS_INICIAIS,
        )
    con.commit()
    con.close()


# ------------------------------------------------------------ regras
def hhmm_para_min(txt):
    h, m = txt.split(":")
    return int(h) * 60 + int(m)


def min_para_hhmm(minutos):
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def horarios_livres(con, servico_id, data_iso, agora=None):
    """Devolve a lista de horários de início ("HH:MM") livres para o serviço.

    Um horário só é livre se o serviço inteiro cabe no expediente, não
    sobrepõe nenhum agendamento existente e não está no passado.
    """
    servico = con.execute(
        "SELECT * FROM servicos WHERE id = ?", (servico_id,)
    ).fetchone()
    if servico is None:
        return None
    agora = agora or datetime.now()
    abre, fecha = hhmm_para_min(ABERTURA), hhmm_para_min(FECHAMENTO)
    ocupados = con.execute(
        "SELECT inicio_min, fim_min FROM agendamentos WHERE data = ?", (data_iso,)
    ).fetchall()
    livres = []
    for inicio in range(abre, fecha, PASSO_MIN):
        fim = inicio + servico["duracao_min"]
        if fim > fecha:
            break
        if any(inicio < o["fim_min"] and fim > o["inicio_min"] for o in ocupados):
            continue
        if data_iso == agora.date().isoformat() and inicio <= agora.hour * 60 + agora.minute:
            continue
        livres.append(min_para_hhmm(inicio))
    return livres


def validar_data(txt):
    try:
        d = date.fromisoformat(txt)
    except (TypeError, ValueError):
        return None
    if d < date.today() or d > date.today() + timedelta(days=60):
        return None
    return d.isoformat()


def criar_agendamento(con, dados, agora=None):
    """Valida e grava. Retorna (status_http, corpo)."""
    nome = (dados.get("nome") or "").strip()
    tel = re.sub(r"\D", "", dados.get("telefone") or "")
    if len(nome) < 2:
        return 400, {"erro": "Informe seu nome."}
    if not 10 <= len(tel) <= 11:
        return 400, {"erro": "Telefone inválido. Use DDD + número."}
    try:
        servico_id = int(dados.get("servico_id"))
    except (TypeError, ValueError):
        return 400, {"erro": "Serviço inválido."}
    data_iso = validar_data(dados.get("data"))
    if data_iso is None:
        return 400, {"erro": "Data inválida (use hoje até 60 dias à frente)."}
    hora = dados.get("hora") or ""
    if not re.fullmatch(r"\d{2}:\d{2}", hora):
        return 400, {"erro": "Horário inválido."}

    livres = horarios_livres(con, servico_id, data_iso, agora)
    if livres is None:
        return 400, {"erro": "Serviço não encontrado."}
    if hora not in livres:
        return 409, {"erro": "Esse horário acabou de ser ocupado. Escolha outro."}

    servico = con.execute("SELECT * FROM servicos WHERE id = ?", (servico_id,)).fetchone()
    inicio = hhmm_para_min(hora)
    cur = con.execute(
        "INSERT INTO agendamentos (servico_id, data, inicio_min, fim_min,"
        " cliente_nome, cliente_telefone, criado_em) VALUES (?,?,?,?,?,?,?)",
        (servico_id, data_iso, inicio, inicio + servico["duracao_min"], nome, tel,
         (agora or datetime.now()).isoformat(timespec="seconds")),
    )
    con.commit()
    return 201, {
        "id": cur.lastrowid,
        "servico": servico["nome"],
        "data": data_iso,
        "inicio": hora,
        "fim": min_para_hhmm(inicio + servico["duracao_min"]),
        "cliente": nome,
    }


def listar_agendamentos(con, data_iso):
    linhas = con.execute(
        "SELECT a.id, a.data, a.inicio_min, a.fim_min, a.cliente_nome,"
        " a.cliente_telefone, s.nome AS servico FROM agendamentos a"
        " JOIN servicos s ON s.id = a.servico_id WHERE a.data = ?"
        " ORDER BY a.inicio_min",
        (data_iso,),
    ).fetchall()
    return [
        {
            "id": l["id"],
            "data": l["data"],
            "inicio": min_para_hhmm(l["inicio_min"]),
            "fim": min_para_hhmm(l["fim_min"]),
            "cliente": l["cliente_nome"],
            "telefone": l["cliente_telefone"],
            "servico": l["servico"],
        }
        for l in linhas
    ]


# ------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "AgendaFacil/1.0"

    def _json(self, status, corpo):
        raw = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _estatico(self, caminho):
        if caminho in ("", "/"):
            caminho = "/index.html"
        alvo = os.path.normpath(os.path.join(FRONT_DIR, caminho.lstrip("/")))
        if not alvo.startswith(FRONT_DIR) or not os.path.isfile(alvo):
            return self._json(404, {"erro": "Não encontrado."})
        tipo = mimetypes.guess_type(alvo)[0] or "application/octet-stream"
        with open(alvo, "rb") as f:
            raw = f.read()
        self.send_response(200)
        self.send_header("Content-Type", f"{tipo}; charset=utf-8" if tipo.startswith("text") or tipo.endswith("javascript") else tipo)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if not url.path.startswith("/api/"):
            return self._estatico(url.path)
        con = conectar()
        try:
            if url.path == "/api/servicos":
                linhas = con.execute("SELECT * FROM servicos ORDER BY id").fetchall()
                return self._json(200, [dict(l) for l in linhas])
            if url.path == "/api/horarios":
                data_iso = validar_data(q.get("data", [""])[0])
                if data_iso is None:
                    return self._json(400, {"erro": "Data inválida."})
                try:
                    sid = int(q.get("servico_id", [""])[0])
                except ValueError:
                    return self._json(400, {"erro": "Serviço inválido."})
                livres = horarios_livres(con, sid, data_iso)
                if livres is None:
                    return self._json(404, {"erro": "Serviço não encontrado."})
                return self._json(200, {"data": data_iso, "livres": livres})
            if url.path == "/api/agendamentos":
                data_iso = q.get("data", [date.today().isoformat()])[0]
                try:
                    date.fromisoformat(data_iso)
                except ValueError:
                    return self._json(400, {"erro": "Data inválida."})
                return self._json(200, listar_agendamentos(con, data_iso))
            return self._json(404, {"erro": "Rota não encontrada."})
        finally:
            con.close()

    def do_POST(self):
        if urlparse(self.path).path != "/api/agendamentos":
            return self._json(404, {"erro": "Rota não encontrada."})
        try:
            tam = int(self.headers.get("Content-Length", 0))
            dados = json.loads(self.rfile.read(tam) or b"{}")
            if not isinstance(dados, dict):
                raise ValueError
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"erro": "JSON inválido."})
        con = conectar()
        try:
            status, corpo = criar_agendamento(con, dados)
        finally:
            con.close()
        self._json(status, corpo)

    def do_DELETE(self):
        m = re.fullmatch(r"/api/agendamentos/(\d+)", urlparse(self.path).path)
        if not m:
            return self._json(404, {"erro": "Rota não encontrada."})
        con = conectar()
        try:
            cur = con.execute("DELETE FROM agendamentos WHERE id = ?", (int(m.group(1)),))
            con.commit()
        finally:
            con.close()
        if cur.rowcount == 0:
            return self._json(404, {"erro": "Agendamento não encontrado."})
        self._json(200, {"ok": True})

    def log_message(self, fmt, *args):
        print(f"[{datetime.now():%H:%M:%S}] {fmt % args}")


def main():
    iniciar_banco()
    porta = int(os.environ.get("PORT", 8000))
    print(f"AgendaFácil rodando em http://localhost:{porta}  (Ctrl+C para parar)")
    ThreadingHTTPServer(("0.0.0.0", porta), Handler).serve_forever()


if __name__ == "__main__":
    main()
