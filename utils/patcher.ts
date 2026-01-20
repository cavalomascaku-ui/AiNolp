
import { CodePatch } from '../types';

/**
 * UTILS
 */

// Normalizes code by removing ALL whitespace.
function normalizeCode(code: string): { normalized: string; mapping: number[] } {
    let normalized = '';
    const mapping: number[] = [];

    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        if (!/\s/.test(char)) {
            normalized += char;
            mapping.push(i);
        }
    }
    return { normalized, mapping };
}

// ----------------------------------------------------------------------
// STRATEGY 1: EXACT MATCH (Legacy)
// ----------------------------------------------------------------------
function exactReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    if (currentCode.includes(originalSnippet)) {
        return currentCode.replace(originalSnippet, newSnippet);
    }
    return null;
}

// ----------------------------------------------------------------------
// STRATEGY 2: ANCHOR MATCHING (Smart Range Replace)
// ----------------------------------------------------------------------
// Finds the start of the snippet and the end of the snippet independently
// and replaces everything in between. This is robust against AI getting
// the middle part wrong (hallucinations) but getting the function signature
// and closing brace correct.
function anchorReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    const lines = originalSnippet.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length < 2) return null; // Need at least start and end anchors

    const startAnchor = lines[0];
    const endAnchor = lines[lines.length - 1];

    // Use normalized search for anchors to ignore whitespace diffs
    const { normalized: normFile, mapping: fileMapping } = normalizeCode(currentCode);
    const { normalized: normStart } = normalizeCode(startAnchor);
    const { normalized: normEnd } = normalizeCode(endAnchor);

    const startIndexNorm = normFile.indexOf(normStart);
    if (startIndexNorm === -1) return null;

    // Search for end anchor AFTER the start anchor
    const endIndexNorm = normFile.indexOf(normEnd, startIndexNorm + normStart.length);
    if (endIndexNorm === -1) return null;

    // Map back to real file indices
    const realStart = fileMapping[startIndexNorm];
    
    // For the end, we want the end of the matched string
    const realEnd = fileMapping[endIndexNorm + normEnd.length - 1] + 1;

    // Safety check: Don't replace huge chunks by accident if anchors are common strings
    // like "<div>" and "</div>". Limit replacement size if it seems suspicious?
    // For now, trusting the AI's anchors.

    const before = currentCode.substring(0, realStart);
    const after = currentCode.substring(realEnd);

    return before + newSnippet + after;
}

// ----------------------------------------------------------------------
// STRATEGY 3: NORMALIZED MATCH (Whitespace Agnostic)
// ----------------------------------------------------------------------
function fuzzyReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    const { normalized: normFile, mapping: fileMapping } = normalizeCode(currentCode);
    const { normalized: normSnippet } = normalizeCode(originalSnippet);

    if (normSnippet.length < 15) return null; // Too risky for short snippets

    const matchIndex = normFile.indexOf(normSnippet);

    if (matchIndex !== -1) {
        const startOriginalIndex = fileMapping[matchIndex];
        const endOriginalIndex = fileMapping[matchIndex + normSnippet.length - 1] + 1;
        const before = currentCode.substring(0, startOriginalIndex);
        const after = currentCode.substring(endOriginalIndex);
        return before + newSnippet + after;
    }
    return null;
}

// ----------------------------------------------------------------------
// STRATEGY 4: HEADER BLOCK REPLACEMENT
// ----------------------------------------------------------------------
// Finds "function x() {" and replaces until the matching "}"
function headerBlockReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    const lines = originalSnippet.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;
    const header = lines[0];
    
    // Must look like a block starter
    if (!header.includes('{')) return null;

    const { normalized: normHeader } = normalizeCode(header);
    const { normalized: normFile, mapping: fileMapping } = normalizeCode(currentCode);
    
    const headerMatchIndex = normFile.indexOf(normHeader);
    if (headerMatchIndex === -1) return null;

    const realHeaderStart = fileMapping[headerMatchIndex];

    // Find block end
    let openBraces = 0;
    let foundStart = false;
    let realEndIndex = -1;

    for (let i = realHeaderStart; i < currentCode.length; i++) {
        const char = currentCode[i];
        if (char === '{') {
            openBraces++;
            foundStart = true;
        } else if (char === '}') {
            openBraces--;
        }

        if (foundStart && openBraces === 0) {
            realEndIndex = i + 1;
            break;
        }
    }

    if (realEndIndex !== -1) {
        const before = currentCode.substring(0, realHeaderStart);
        const after = currentCode.substring(realEndIndex);
        return before + newSnippet + after;
    }

    return null;
}

// ----------------------------------------------------------------------
// STRATEGY 5: FALLBACK INJECTION (Append)
// ----------------------------------------------------------------------
function fallbackInject(currentCode: string, patch: CodePatch): string | null {
    const newSnippet = patch.newSnippet || '';
    if (!newSnippet) return null;

    if (patch.targetFile.endsWith('.css')) {
        return currentCode + '\n\n' + newSnippet;
    }
    
    if (patch.targetFile.endsWith('.js') || patch.targetFile.endsWith('.html')) {
        // If it looks like a full file replacement (contains doctype or html tag), return it directly
        if (newSnippet.includes('<!DOCTYPE') || newSnippet.includes('<html')) {
            return newSnippet;
        }

        if (currentCode.includes('</body>')) {
            return currentCode.replace('</body>', `${newSnippet}\n</body>`);
        }
        if (currentCode.includes('</script>')) {
             const lastScriptIdx = currentCode.lastIndexOf('</script>');
             return currentCode.substring(0, lastScriptIdx) + '\n' + newSnippet + '\n' + currentCode.substring(lastScriptIdx);
        }
        return currentCode + '\n' + newSnippet;
    }
    return null;
}


// ----------------------------------------------------------------------
// MAIN APPLY FUNCTION
// ----------------------------------------------------------------------
export const applyPatch = (currentCode: string, patch: CodePatch): { newCode: string; success: boolean; error?: string } => {
  const originalSnippet = patch.originalSnippet || '';
  const newSnippet = patch.newSnippet || ''; 

  // 1. Creation / Full Overwrite
  const isFullHtml = (newSnippet.includes('<!DOCTYPE html>') || newSnippet.trim().startsWith('<html'));
  if (isFullHtml || patch.action === 'create' || currentCode.trim().length === 0 || currentCode.includes('Novo Projeto')) {
      return { newCode: newSnippet, success: true };
  }
  
  if (patch.action === 'delete') {
      return { newCode: '', success: true };
  }

  if (!originalSnippet) {
      const injected = fallbackInject(currentCode, patch);
      if (injected) return { newCode: injected, success: true };
      return { newCode: currentCode, success: false, error: "Snippet original ausente. Impossível substituir." };
  }

  // 2. Exact Match (Fastest)
  const exact = exactReplace(currentCode, originalSnippet, newSnippet);
  if (exact) return { newCode: exact, success: true };

  // 3. Anchor Match (Safest for edits) - Uses Start and End lines to find the block
  const anchor = anchorReplace(currentCode, originalSnippet, newSnippet);
  if (anchor) return { newCode: anchor, success: true };

  // 4. Header Block Match (Best for Function Replacements)
  const headerBlock = headerBlockReplace(currentCode, originalSnippet, newSnippet);
  if (headerBlock) return { newCode: headerBlock, success: true };

  // 5. Normalized Fuzzy Match (Good for indentation diffs)
  const fuzzy = fuzzyReplace(currentCode, originalSnippet, newSnippet);
  if (fuzzy) return { newCode: fuzzy, success: true };

  // 6. Fallback Injection
  const injected = fallbackInject(currentCode, patch);
  if (injected) {
      console.warn("Patch applied via Fallback Injection (Append)");
      return { newCode: injected, success: true };
  }

  // 7. Fail
  console.error("PATCH FAILED. Snippet not found in file.");
  return { 
      newCode: currentCode, 
      success: false, 
      error: "Falha ao encontrar o local exato para editar. A IA tentará novamente." 
  };
};

export const formatHTML = (html: string): string => {
  return html;
};
