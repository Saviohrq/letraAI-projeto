import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

const CRITERIOS_ENEM = `
COMPETÊNCIA 1 — Domínio da norma culta escrita formal
200: domínio excelente; desvios só como exceção rara, sem repetição.
160: bom domínio; poucos desvios gramaticais e de convenções da escrita.
120: domínio mediano; alguns desvios gramaticais e de convenções da escrita.
80: domínio insuficiente; muitos desvios gramaticais, de registro e de convenções da escrita.
40: domínio precário; desvios frequentes e sistemáticos.
0: desconhecimento da norma culta.

COMPETÊNCIA 2 — Compreensão do tema e estrutura dissertativo-argumentativa
200: argumentação consistente, com repertório sociocultural produtivo, e excelente domínio da estrutura dissertativo-argumentativa.
160: argumentação consistente e bom domínio da estrutura (proposição, argumentação e conclusão).
120: argumentação previsível e domínio mediano da estrutura.
80: recorre à cópia de trechos dos textos motivadores, ou domínio insuficiente da estrutura (falta proposição, argumentação ou conclusão).
40: tangencia o tema, ou domínio precário da estrutura, com traços constantes de outros tipos textuais.
0: foge do tema ou não é um texto dissertativo-argumentativo — ATENÇÃO: neste caso a redação inteira é ANULADA (nota 0 em TODAS as 5 competências, não só nesta).

COMPETÊNCIA 3 — Seleção e organização de argumentos
200: informações, fatos e opiniões organizados de forma consistente, com autoria evidente, em defesa de um ponto de vista.
160: organizados, com indícios de autoria, em defesa de um ponto de vista.
120: limitados aos argumentos dos textos motivadores e pouco organizados.
80: desorganizados ou contraditórios, e limitados aos textos motivadores.
40: pouco relacionados ao tema ou incoerentes, sem defesa clara de um ponto de vista.
0: não relacionados ao tema.

COMPETÊNCIA 4 — Mecanismos linguísticos (coesão)
200: boa articulação entre as partes do texto, com repertório diversificado de conectivos.
160: boa articulação, poucas inadequações, repertório diversificado.
120: articulação mediana, algumas inadequações, repertório pouco diversificado.
80: articulação insuficiente, muitas inadequações, repertório limitado.
40: articulação precária.
0: não articula as informações.

COMPETÊNCIA 5 — Proposta de intervenção
200: proposta muito bem elaborada, detalhada, relacionada ao tema e articulada com a discussão do texto.
160: proposta bem elaborada, relacionada ao tema e articulada com a discussão.
120: proposta elaborada de forma mediana, relacionada e articulada.
80: proposta insuficiente, ou não articulada com a discussão desenvolvida.
40: proposta vaga, precária, ou relacionada apenas ao assunto (não ao problema específico discutido).
0: não apresenta proposta de intervenção, ou apresenta apenas uma CONSTATAÇÃO do problema (sem indicar uma ação para resolvê-lo), ou a proposta desrespeita os direitos humanos.

IMPORTANTE sobre a Competência 5 — para nota alta, a proposta precisa conter estes elementos:
- AÇÃO: o elemento essencial — o que fazer para resolver o problema (não basta constatar que "falta X").
- AGENTE: quem deve executar a ação (indivíduo, família, comunidade, sociedade, poder público, etc.).
- MEIO/MODO: como a ação será executada.
- EFEITO/FINALIDADE: qual resultado a ação busca alcançar.
- DETALHAMENTO: alguma informação adicional que aprofunde a proposta.
Diferencie PROPOR (indicar uma ação concreta para o futuro) de CONSTATAR (só descrever ou reconhecer um problema existente, sem indicar solução) — constatação sozinha não conta como proposta de intervenção.

DESRESPEITO AOS DIREITOS HUMANOS (nota 0 na Competência 5, e sinalizar possivel_anulacao): defesa de tortura, mutilação, execução sumária ou qualquer forma de "justiça com as próprias mãos"; incitação a violência motivada por raça, etnia, gênero, credo, opinião política, condição física ou origem geográfica/socioeconômica; qualquer discurso de ódio contra grupos sociais específicos.

REGRA GERAL DE ANULAÇÃO: se a redação foge completamente do tema proposto, ou não segue a estrutura dissertativo-argumentativa (ex: é um poema, uma lista, um texto narrativo puro), a redação inteira é anulada — nesse caso, sinalize possivel_anulacao = true e explique o motivo, independentemente das notas individuais que atribuir.
`;

const SCHEMA_AVALIACAO = {
  type: 'OBJECT',
  properties: {
    transcricao: { type: 'STRING', description: 'Transcrição fiel do texto manuscrito' },
    competencia_1: { type: 'INTEGER', enum: ['0', '40', '80', '120', '160', '200'] },
    justificativa_1: { type: 'STRING' },
    competencia_2: { type: 'INTEGER', enum: ['0', '40', '80', '120', '160', '200'] },
    justificativa_2: { type: 'STRING' },
    competencia_3: { type: 'INTEGER', enum: ['0', '40', '80', '120', '160', '200'] },
    justificativa_3: { type: 'STRING' },
    competencia_4: { type: 'INTEGER', enum: ['0', '40', '80', '120', '160', '200'] },
    justificativa_4: { type: 'STRING' },
    competencia_5: { type: 'INTEGER', enum: ['0', '40', '80', '120', '160', '200'] },
    justificativa_5: { type: 'STRING' },
    possivel_anulacao: { type: 'BOOLEAN' },
    motivo_anulacao: { type: 'STRING' },
    comentario_geral: { type: 'STRING' }
  },
  required: [
    'transcricao', 'competencia_1', 'justificativa_1', 'competencia_2', 'justificativa_2',
    'competencia_3', 'justificativa_3', 'competencia_4', 'justificativa_4',
    'competencia_5', 'justificativa_5', 'possivel_anulacao', 'comentario_geral'
  ]
};

const CONFIGURACAO_SEGURANCA = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
];

function montarPrompt(tema) {
  return `Você é um corretor especializado em redações do ENEM, atuando como apoio de PRÉ-análise para um professor humano — a decisão final é sempre dele.

Tema proposto: ${tema || 'não informado'}

${CRITERIOS_ENEM}

Primeiro transcreva fielmente o texto manuscrito da imagem (preserve erros ortográficos, não corrija nada). Depois avalie cada competência com nota e uma justificativa curta e objetiva. Sinalize se há algum motivo de anulação. Lembre-se: o tema pode tratar de assuntos sociais sensíveis — isso é normal e esperado em redações do ENEM, avalie o conteúdo normalmente.`;
}

async function baixarImagemComoBase64(url) {
  const resposta = await axios.get(url, { responseType: 'arraybuffer' });
  const mediaType = resposta.headers['content-type'] || 'image/jpeg';
  return { base64: Buffer.from(resposta.data).toString('base64'), mediaType };
}

export async function gerarPreAnaliseIA({ imagemUrl, tema }) {
  const { base64, mediaType } = await baixarImagemComoBase64(imagemUrl);

  const resposta = await genAI.models.generateContent({
    model: MODELO,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mediaType, data: base64 } },
        { text: montarPrompt(tema) }
      ]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMA_AVALIACAO,
      safetySettings: CONFIGURACAO_SEGURANCA
    }
  });

  if (!resposta.text) {
    const motivoBloqueio = resposta.candidates?.[0]?.finishReason;
    throw new Error(`Gemini não retornou avaliação. Motivo: ${motivoBloqueio || 'desconhecido'}`);
  }

  try {
    return JSON.parse(resposta.text);
  } catch {
    throw new Error('Gemini retornou um JSON inválido na avaliação.');
  }
}

// Variante para testes: recebe o texto já transcrito em vez de imagem.
// Usada pelo script de calibração com o banco de redações UOL (Parte 12).
export async function analisarTextoDireto({ texto, tema }) {
  const resposta = await genAI.models.generateContent({
    model: MODELO,
    contents: [{
      role: 'user',
      parts: [{
        text: `${montarPrompt(tema)}\n\nO texto abaixo já está transcrito — não é necessário reescrevê-lo, apenas repita-o no campo "transcricao" e avalie normalmente.\n\nTexto da redação:\n${texto}`
      }]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMA_AVALIACAO,
      safetySettings: CONFIGURACAO_SEGURANCA
    }
  });

  if (!resposta.text) {
    const motivoBloqueio = resposta.candidates?.[0]?.finishReason;
    throw new Error(`Gemini não retornou avaliação. Motivo: ${motivoBloqueio || 'desconhecido'}`);
  }
  return JSON.parse(resposta.text);
}