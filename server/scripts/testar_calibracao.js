// server/scripts/testar_calibracao.js
//
// Roda a pré-análise por IA em cada redação de um arquivo JSON (gerado pelo
// extrair_redacoes_uol.py) e compara com as notas oficiais, para você ter
// uma ideia de quão perto a IA chega do avaliador humano.
//
// Uso (dentro da pasta server):
//   node scripts/testar_calibracao.js redacoes_teste.json
//
// Gera também um arquivo "resultados_calibracao.json" com a análise completa
// de cada redação (transcrição + notas + justificativas), para leitura detalhada.

import 'dotenv/config';
import fs from 'fs';
import { analisarTextoDireto } from '../src/services/iaService.js';

const ARQUIVO_ENTRADA = process.argv[2] || 'redacoes_teste.json';
const ARQUIVO_SAIDA_DETALHADO = 'resultados_calibracao.json';
const COMPETENCIAS = ['Competência 1', 'Competência 2', 'Competência 3', 'Competência 4', 'Competência 5'];
const CAMPOS_ANALISE = ['competencia_1', 'competencia_2', 'competencia_3', 'competencia_4', 'competencia_5'];

const ESPERA_ENTRE_CHAMADAS_MS = 15000;
const MAX_TENTATIVAS = 4;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diferenca(oficial, gerada) {
  return Math.abs(oficial - gerada);
}

function calcularEsperaRetentativa(mensagemErro, tentativa) {
  const match = mensagemErro.match(/retryDelay":"(\d+)s/);
  if (match) {
    return (parseInt(match[1], 10) + 2) * 1000;
  }
  return ESPERA_ENTRE_CHAMADAS_MS * tentativa;
}

async function analisarComRetentativa(texto, tema, tentativa = 1) {
  try {
    return await analisarTextoDireto({ texto, tema });
  } catch (erro) {
    const ehErroTemporario = erro.message.includes('RESOURCE_EXHAUSTED')
      || erro.message.includes('UNAVAILABLE')
      || erro.message.includes('503')
      || erro.message.includes('429');

    if (ehErroTemporario && tentativa < MAX_TENTATIVAS) {
      const espera = calcularEsperaRetentativa(erro.message, tentativa);
      console.log(`  Limite/instabilidade da API — aguardando ${Math.round(espera / 1000)}s antes de tentar de novo (tentativa ${tentativa + 1}/${MAX_TENTATIVAS})...`);
      await esperar(espera);
      return analisarComRetentativa(texto, tema, tentativa + 1);
    }
    throw erro;
  }
}

async function main() {
  if (!fs.existsSync(ARQUIVO_ENTRADA)) {
    console.error(`Arquivo não encontrado: ${ARQUIVO_ENTRADA}`);
    console.error('Gere um com o extrair_redacoes_uol.py e copie para essa pasta.');
    process.exit(1);
  }

  const redacoes = JSON.parse(fs.readFileSync(ARQUIVO_ENTRADA, 'utf-8'));
  const resultadosPorCompetencia = { c1: [], c2: [], c3: [], c4: [], c5: [] };
  const resultadosDetalhados = [];

  for (let i = 0; i < redacoes.length; i++) {
    const redacao = redacoes[i];
    console.log(`\n--- (${i + 1}/${redacoes.length}) Analisando: "${redacao.titulo}" ---`);
    try {
      const analise = await analisarComRetentativa(redacao.texto_original, redacao.tema);

      const diffsDestaRedacao = {};
      COMPETENCIAS.forEach((nomeCompetencia, indice) => {
        const chave = `c${indice + 1}`;
        const notaOficial = redacao.notas_oficiais_enem_aprox[nomeCompetencia];
        const notaGerada = analise[CAMPOS_ANALISE[indice]];
        const diff = diferenca(notaOficial, notaGerada);

        resultadosPorCompetencia[chave].push(diff);
        diffsDestaRedacao[chave] = diff;
        console.log(`  ${nomeCompetencia}: oficial ≈ ${notaOficial} | IA = ${notaGerada} | diferença = ${diff}`);
      });

      // Guarda tudo (incluindo justificativas) para leitura detalhada depois
      resultadosDetalhados.push({
        titulo: redacao.titulo,
        tema: redacao.tema,
        notas_oficiais_enem_aprox: redacao.notas_oficiais_enem_aprox,
        diferencas: diffsDestaRedacao,
        analise_ia: analise // inclui transcricao, competencia_1..5, justificativa_1..5, comentario_geral, possivel_anulacao
      });
    } catch (erro) {
      console.error(`  Erro nesta redação (desistindo após ${MAX_TENTATIVAS} tentativas): ${erro.message}`);
      resultadosDetalhados.push({
        titulo: redacao.titulo,
        erro: erro.message
      });
    }

    if (i < redacoes.length - 1) {
      console.log(`  Aguardando ${ESPERA_ENTRE_CHAMADAS_MS / 1000}s antes da próxima (limite de taxa do tier gratuito)...`);
      await esperar(ESPERA_ENTRE_CHAMADAS_MS);
    }
  }

  console.log('\n=== Resumo: diferença média por competência (quanto menor, melhor) ===');
  Object.entries(resultadosPorCompetencia).forEach(([chave, diffs]) => {
    if (diffs.length === 0) {
      console.log(`${chave}: nenhuma redação processada com sucesso`);
      return;
    }
    const media = diffs.reduce((soma, d) => soma + d, 0) / diffs.length;
    console.log(`${chave}: ${media.toFixed(1)} pontos de diferença, em média (baseado em ${diffs.length} redações)`);
  });

  fs.writeFileSync(ARQUIVO_SAIDA_DETALHADO, JSON.stringify(resultadosDetalhados, null, 2), 'utf-8');
  console.log(`\nDetalhes completos (transcrição + justificativas de cada competência) salvos em: ${ARQUIVO_SAIDA_DETALHADO}`);
  console.log('Abra esse arquivo no VS Code para ler as justificativas redação por redação.');

  console.log('\nLembrete: a nota "oficial" aqui é uma conversão aproximada da escala UOL (0-2)');
  console.log('para a escala ENEM (0-200), então trate esses números como direção geral,');
  console.log('não como precisão exata.');
}

main();