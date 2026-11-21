"""Testes da regra de negócio central da PoC: agendar sem conflito de horário.

Execução:  python -m unittest backend/test_api.py -v
"""
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["AGENDA_DB"] = os.path.join(tempfile.mkdtemp(), "teste.db")

import server  # noqa: E402


class AgendamentoTest(unittest.TestCase):
    def setUp(self):
        if os.path.exists(server.DB_PATH):
            os.remove(server.DB_PATH)
        server.iniciar_banco()
        self.con = server.conectar()
        self.amanha = (date.today() + timedelta(days=1)).isoformat()
        self.agora = datetime.now()

    def tearDown(self):
        self.con.close()

    def dados(self, **extra):
        base = {"servico_id": 1, "data": self.amanha, "hora": "10:00",
                "nome": "Carlos Souza", "telefone": "(11) 91234-5678"}
        base.update(extra)
        return base

    def test_agenda_vazia_tem_todos_os_horarios(self):
        livres = server.horarios_livres(self.con, 1, self.amanha)
        self.assertEqual(livres[0], "09:00")
        self.assertEqual(livres[-1], "17:30")
        self.assertEqual(len(livres), 18)

    def test_cria_agendamento_valido(self):
        status, corpo = server.criar_agendamento(self.con, self.dados())
        self.assertEqual(status, 201)
        self.assertEqual(corpo["inicio"], "10:00")
        self.assertEqual(corpo["fim"], "10:30")

    def test_mesmo_horario_gera_conflito(self):
        server.criar_agendamento(self.con, self.dados())
        status, _ = server.criar_agendamento(self.con, self.dados(nome="Outra Pessoa"))
        self.assertEqual(status, 409)

    def test_servico_longo_bloqueia_horarios_sobrepostos(self):
        # Coloração (90 min) às 10:00 ocupa até 11:30
        server.criar_agendamento(self.con, self.dados(servico_id=4))
        livres = server.horarios_livres(self.con, 1, self.amanha)
        for h in ("10:00", "10:30", "11:00"):
            self.assertNotIn(h, livres)
        self.assertIn("11:30", livres)
        self.assertIn("09:30", livres)

    def test_servico_nao_pode_ultrapassar_o_fechamento(self):
        livres = server.horarios_livres(self.con, 4, self.amanha)  # 90 min
        self.assertEqual(livres[-1], "16:30")

    def test_horario_anterior_que_invade_o_ocupado_e_removido(self):
        server.criar_agendamento(self.con, self.dados(hora="10:00"))
        livres = server.horarios_livres(self.con, 3, self.amanha)  # 60 min
        self.assertNotIn("09:30", livres)  # 09:30-10:30 invadiria 10:00
        self.assertIn("09:00", livres)

    def test_validacoes(self):
        self.assertEqual(server.criar_agendamento(self.con, self.dados(nome=""))[0], 400)
        self.assertEqual(server.criar_agendamento(self.con, self.dados(telefone="123"))[0], 400)
        self.assertEqual(server.criar_agendamento(self.con, self.dados(data="2000-01-01"))[0], 400)
        self.assertEqual(server.criar_agendamento(self.con, self.dados(hora="25:99x"))[0], 400)
        self.assertEqual(server.criar_agendamento(self.con, self.dados(servico_id="abc"))[0], 400)
        self.assertEqual(server.criar_agendamento(self.con, self.dados(servico_id=99))[0], 400)

    def test_horarios_passados_de_hoje_nao_aparecem(self):
        hoje = date.today().isoformat()
        meio_dia = datetime.combine(date.today(), datetime.strptime("12:00", "%H:%M").time())
        livres = server.horarios_livres(self.con, 1, hoje, agora=meio_dia)
        self.assertTrue(all(h > "12:00" for h in livres))

    def test_listagem_ordenada_por_horario(self):
        server.criar_agendamento(self.con, self.dados(hora="15:00"))
        server.criar_agendamento(self.con, self.dados(hora="09:00", nome="Ana Lima"))
        lista = server.listar_agendamentos(self.con, self.amanha)
        self.assertEqual([a["inicio"] for a in lista], ["09:00", "15:00"])


if __name__ == "__main__":
    unittest.main()
