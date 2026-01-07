
import { CodePatch } from '../types';

/**
 * Escapes special regex characters.
 */
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Limpa artefatos comuns de alucinação da IA e deduplica spam
 */
function sanitizeSnippet(snippet: string): string {
    if (!snippet) return '';
    let s = snippet;

    // Remove blocos de código markdown se a IA esquecer de tirar
    s = s.replace(/^```[a-z]*\n/i, '').replace(/```$/i, '');

    // Remove o padrão style> n <style e spam de /n
    s = s.replace(/(style>\s*n\s*<style\s*)+/gi, ''); 
    s = s.replace(/style>\s*n\s*<style/gi, '');
    s = s.replace(/(\/n\s*){3,}/g, '\n');

    // Remove linhas repetidas consecutivas (anti-loop)
    const lines = s.split('\n');
    const deduped: string[] = [];
    let last = '';
    let count = 0;
    for (const l of lines) {
        const trim = l.trim();
        if (trim === 'n' || trim === '/n') continue; 
        
        if (trim === last && trim.length > 0) {
            count++;
            if (count < 2) deduped.push(l); 
        } else {
            count = 0;
            last = trim;
            deduped.push(l);
        }
    }
    s = deduped.join('\n');

    // Correções de segurança básicas
    s = s.replace(/\\n/g, '\n');
    s = s.replace(/\\"/g, '"');

    return s.trim();
}

export const formatHTML = (html: string): string => {
  try {
      let formatted = '';
      let indent = 0;
      const clean = html.replace(/>\s+</g, '><').trim();
      const tags = clean.replace(/>/g, '>\n').replace(/</g, '\n<').split('\n');
      tags.forEach(tag => {
        if (!tag.trim()) return;
        if (tag.match(/^<\//)) indent = Math.max(0, indent - 1);
        formatted += '  '.repeat(indent) + tag.trim() + '\n';
        const isOpening = tag.match(/^<[a-zA-Z]/);
        const isSelfClosing = tag.match(/\/>$/);
        const isVoid = tag.match(/^<(input|img|br|hr|meta|link|base|area|col|embed|source|track|wbr)/i);
        if (isOpening && !isSelfClosing && !isVoid && !tag.startsWith('<!')) indent++;
      });
      return formatted.trim();
  } catch (e) {
      return html;
  }
};

/**
 * Aplica o patch com lógica de "Fail-Safe".
 */
export const applyPatch = (currentCode: string, patch: CodePatch): { newCode: string; success: boolean; error?: string } => {
  const originalSnippet = patch.originalSnippet || '';
  let newSnippet = sanitizeSnippet(patch.newSnippet || '');

  // 0. Validações básicas
  if (!newSnippet && patch.action !== 'delete') {
      return { newCode: currentCode, success: false, error: "Snippet vazio." };
  }
  
  // 1. Detecta substituição total (Arquivo Inteiro) ou Criação
  const isFullHtml = (newSnippet.includes('<!DOCTYPE html>') || newSnippet.startsWith('<html'));
  if (isFullHtml || patch.action === 'create') {
      return { newCode: newSnippet, success: true };
  }

  // 2. Estratégia A: Match Exato (Ideal)
  if (originalSnippet && currentCode.includes(originalSnippet)) {
    return { newCode: currentCode.replace(originalSnippet, newSnippet), success: true };
  }

  // 3. Estratégia B: Normalização (Ignora espaços em branco diferentes)
  // Remove espaços extras e quebras de linha para comparar a "essência" do código
  const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
  const normCurrent = normalize(currentCode);
  const normSearch = normalize(originalSnippet);

  // Se o snippet original normalizado for encontrado, precisamos achar a posição real no código não normalizado
  // Isso é complexo, então vamos tentar uma abordagem de Regex Flexível primeiro
  
  if (originalSnippet.length > 10) {
      try {
          // Cria um regex que permite qualquer whitespace entre as palavras do snippet original
          const parts = originalSnippet.split(/\s+/).filter(p => p.length > 0);
          // Escapa caracteres especiais de regex
          const escapedParts = parts.map(escapeRegExp);
          // Junta com \s+ (um ou mais espaços/newlines)
          const regexString = escapedParts.join('\\s+');
          const regex = new RegExp(regexString);
          
          if (regex.test(currentCode)) {
              return { newCode: currentCode.replace(regex, newSnippet), success: true };
          }
      } catch (e) {
          // Regex falhou ou muito complexo
      }
  }

  // 4. Estratégia C: Injeção de Segurança (Append)
  // Se não achou onde substituir, mas é código válido, tenta adicionar no final
  // ISSO EVITA A "TELA CINZA" de código corrompido no meio do arquivo
  
  // Se for CSS
  if (newSnippet.includes('{') && newSnippet.includes('}') && !newSnippet.includes('function') && !newSnippet.includes('<') && (patch.targetFile.endsWith('.css') || currentCode.includes('</style>'))) {
      if (currentCode.includes('</style>')) {
          return { newCode: currentCode.replace('</style>', `\n/* IA UPDATE */\n${newSnippet}\n</style>`), success: true };
      }
      return { newCode: currentCode + '\n' + newSnippet, success: true };
  }
  
  // Se for JS (Funções ou Variáveis)
  if ((newSnippet.includes('function ') || newSnippet.includes('const ') || newSnippet.includes('class ')) && !newSnippet.includes('</script>')) {
      if (currentCode.includes('</script>')) {
           const lastScript = currentCode.lastIndexOf('</script>');
           const before = currentCode.substring(0, lastScript);
           const after = currentCode.substring(lastScript);
           return { newCode: `${before}\n// IA ADDITION\n${newSnippet}\n${after}`, success: true };
      }
  }

  // 5. Se nada funcionou, FALHA SEGURA.
  // Melhor não aplicar o patch do que quebrar o jogo inteiro.
  return { 
      newCode: currentCode, 
      success: false, 
      error: "Local exato não encontrado. Patch abortado para evitar corrupção." 
  };
};
