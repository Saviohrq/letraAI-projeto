"""
Extrai uma amostra de redações do banco UOL (uol-redacoes-xml) para um JSON
que o backend Node pode consumir para testar a pré-análise por IA.

Antes de rodar, instale o pacote:
    pip install git+https://github.com/gpassero/uol-redacoes-xml.git

Uso:
    python extrair_redacoes_uol.py --quantidade 20 --saida redacoes_teste.json
"""
import argparse
import json
import random

import uol_redacoes_xml


def converter_nota_para_enem(nota_uol):
    """Converte a nota UOL (0, 1 ou 2) para uma aproximação da escala oficial
    do ENEM (0-200).

    ATENÇÃO: essa conversão é uma aproximação de ORDEM DE GRANDEZA, não uma
    equivalência exata -- a escala oficial do ENEM tem 6 níveis (0, 40, 80,
    120, 160, 200) e a da UOL tem apenas 3 (0, 1, 2). Uma nota UOL "1", por
    exemplo, pode corresponder a um 80 ou a um 120 na prática, dependendo do
    caso -- não dá pra saber com certeza a partir só desse dado.
    """
    return round(nota_uol * 100)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quantidade", type=int, default=20,
                         help="Quantas redações extrair da amostra")
    parser.add_argument("--saida", type=str, default="redacoes_teste.json",
                         help="Nome do arquivo JSON de saída")
    parser.add_argument("--semente", type=int, default=42,
                         help="Semente aleatória, para a amostra ser sempre a mesma")
    args = parser.parse_args()

    print("Carregando o banco de redações (pode levar alguns segundos na primeira vez)...")
    essays = uol_redacoes_xml.load()
    print(f"Total de redações disponíveis: {len(essays)}")

    # Mantém só redações com as 5 competências presentes (algumas no banco têm dados incompletos)
    essays_validas = [e for e in essays if len(e.criteria_scores) == 5]
    print(f"Redações com as 5 competências completas: {len(essays_validas)}")

    random.seed(args.semente)
    amostra = random.sample(essays_validas, min(args.quantidade, len(essays_validas)))

    saida = []
    for i, essay in enumerate(amostra):
        saida.append({
            "id": i + 1,
            "titulo": essay.title,
            "tema": essay.prompt.title if essay.prompt else "",
            "texto_original": essay.text,
            "nota_final_uol": essay.final_score,
            "notas_oficiais_uol": essay.criteria_scores,
            "notas_oficiais_enem_aprox": {
                nome: converter_nota_para_enem(nota)
                for nome, nota in essay.criteria_scores.items()
            }
        })

    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)

    print(f"\n{len(saida)} redações salvas em {args.saida}")
    print("Copie esse arquivo para dentro da pasta 'server' do seu projeto para usar no script de teste do Node.")


if __name__ == "__main__":
    main()
