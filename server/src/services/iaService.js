import { GoogleGenAI } from '@google/genai';
import axios from 'axios';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

const CRITERIOS_ENEM = `
Competência 1: Domínio da modalidade escrita formal da língua portuguesa.
Competência 2: Compreender a proposta e aplicar conceitos de várias áreas para desenvolver o tema, dentro dos limites do texto dissertativo-argumentativo.
Competência 3: Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.
Competência 4: Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.
Competência 5: Elaborar proposta de intervenção para o problema abordado, que respeite os direitos humanos.
Cada competência é pontuada em: 0, 40, 80, 120, 160 ou 200.
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