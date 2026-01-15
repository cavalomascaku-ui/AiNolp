
import { CodePatch } from '../types';

/**
 * UTILS
 */
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ----------------------------------------------------------------------
// STRATEGY 1: EXACT MATCH
// ----------------------------------------------------------------------
function exactReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    if (currentCode.includes(originalSnippet)) {
        return currentCode.replace(originalSnippet, newSnippet);
    }
    return null;
}

// ----------------------------------------------------------------------
// STRATEGY 2: TOKEN SLIDING WINDOW (THE "NUCLEAR" OPTION)
// ----------------------------------------------------------------------
// This strategy ignores ALL punctuation, whitespace, and formatting.
// It matches the sequence of alphanumeric "words" (tokens).
//
// Example:
// File:    <div id="app" class="main">
// Snippet: <div id='app' class='main'>
// Tokens:  [div, id, app, class, main] -> MATCH!
//
// It then maps the token positions back to the original string indices to replace safely.

interface Token {
    value: string;
    start: number;
    end: number;
}

function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    // Match alphanumeric words, identifiers, numbers. 
    // We intentionally ignore symbols like < > = " ' ; { } [ ]
    // Regex explanation: [a-zA-Z0-9_$]+ matches typical JS identifiers and HTML tag names
    const regex = /[a-zA-Z0-9_$]+/g;
    
    let match;
    while ((match = regex.exec(text)) !== null) {
        tokens.push({
            value: match[0],
            start: match.index,
            end: match.index + match[0].length
        });
    }
    return tokens;
}

function tokenBasedReplace(currentCode: string, originalSnippet: string, newSnippet: string): string | null {
    const fileTokens = tokenize(currentCode);
    const snippetTokens = tokenize(originalSnippet);

    // Safety: If snippet is too small (e.g., just "div"), it's too dangerous to replace fuzzily.
    // Minimum 3 tokens to ensure context (e.g. "function start game")
    if (snippetTokens.length < 3) return null;

    if (snippetTokens.length === 0) return null;

    // Sliding Window Search
    // We look for the sequence of snippetTokens inside fileTokens
    let matchStartIndex = -1;

    for (let i = 0; i <= fileTokens.length - snippetTokens.length; i++) {
        let isMatch = true;
        for (let j = 0; j < snippetTokens.length; j++) {
            if (fileTokens[i + j].value !== snippetTokens[j].value) {
                isMatch = false;
                break;
            }
        }

        if (isMatch) {
            // Check for uniqueness: If we find a second match, it's ambiguous, so abort (safety first)
            // Exception: If the snippet is huge (>20 tokens), we assume uniqueness is implied by complexity
            if (snippetTokens.length < 20) {
                for (let k = i + 1; k <= fileTokens.length - snippetTokens.length; k++) {
                    let isDouble = true;
                    for (let l = 0; l < snippetTokens.length; l++) {
                        if (fileTokens[k + l].value !== snippetTokens[l].value) {
                            isDouble = false;
                            break;
                        }
                    }
                    if (isDouble) return null; // Ambiguous match found
                }
            }
            
            matchStartIndex = i;
            break;
        }
    }

    if (matchStartIndex !== -1) {
        // We found the token sequence!
        const firstToken = fileTokens[matchStartIndex];
        const lastToken = fileTokens[matchStartIndex + snippetTokens.length - 1];

        // Original start/end in the file string
        // We expand slightly to catch surrounding punctuation that might have been part of the block
        // e.g. if tokens are "function" ... "}" we want to include the punctuation around them if logically part of the line
        
        let startChar = firstToken.start;
        let endChar = lastToken.end;

        // EXPANSION LOGIC:
        // Attempt to expand selection backwards to cover opening bracket/tag if the snippet implies it
        // Example: Snippet "div class='x'" -> Tokens "div", "class", "x". 
        // File "<div class='x'>". We want to capture the "<"
        
        const originalTrimmed = originalSnippet.trim();
        const fileSubstring = currentCode.substring(startChar, endChar);

        // Simple heuristic: If the snippet is roughly the same length as the match, just replace.
        // If not, we might be missing punctuation.
        // Ideally, we replace from the start of the first token to the end of the last token.
        // But we need to handle cases like: Snippet: "const x = 1;" (tokens: const, x, 1)
        // File: "const x = 1;"
        // The tokens don't include ";". 
        
        // Scan forward from endChar to consume meaningful punctuation that matches the snippet's intent
        // (This is tricky, so we stick to the token boundaries + safe whitespace consumption)
        
        // Aggressive Expansion:
        // Look backwards from startChar for non-alphanumeric chars that match the originalSnippet's start
        let snippetPtr = 0;
        while (snippetPtr < originalSnippet.length && !/[a-zA-Z0-9_$]/.test(originalSnippet[snippetPtr])) {
             // The snippet starts with symbols (e.g. "<!--"). 
             // Move startChar back in file to match these if present
             const charToMatch = originalSnippet[snippetPtr];
             let backCheck = startChar - 1;
             // Skip whitespace in file
             while (backCheck >= 0 && /\s/.test(currentCode[backCheck])) backCheck--;
             
             if (backCheck >= 0 && currentCode[backCheck] === charToMatch) {
                 startChar = backCheck;
             }
             snippetPtr++;
        }

        // Look forwards from endChar
        let snippetEndPtr = originalSnippet.length - 1;
        while (snippetEndPtr >= 0 && !/[a-zA-Z0-9_$]/.test(originalSnippet[snippetEndPtr])) {
            const charToMatch = originalSnippet[snippetEndPtr];
            let fwdCheck = endChar;
            while (fwdCheck < currentCode.length && /\s/.test(currentCode[fwdCheck])) fwdCheck++;
            
            if (fwdCheck < currentCode.length && currentCode[fwdCheck] === charToMatch) {
                endChar = fwdCheck + 1;
            }
            snippetEndPtr--;
        }

        const before = currentCode.substring(0, startChar);
        const after = currentCode.substring(endChar);
        
        return before + newSnippet + after;
    }

    return null;
}

// ----------------------------------------------------------------------
// STRATEGY 3: FALLBACK INJECTION (APPEND)
// ----------------------------------------------------------------------
function fallbackInject(currentCode: string, patch: CodePatch): string | null {
    // If it's a new function or style, just append it to the end of the file/block
    // This is better than failing completely.
    
    // Only applies if the prompt looks like "Add function X"
    const newSnippet = patch.newSnippet || '';
    
    // Safety: Don't just append random small fixes like "x = 1"
    // Only append substantial blocks (functions, css rules, classes)
    const isSubstantial = newSnippet.includes('{') && newSnippet.includes('}');
    
    if (!isSubstantial) return null;

    if (patch.targetFile.endsWith('.css')) {
        return currentCode + '\n\n' + newSnippet;
    }
    
    if (patch.targetFile.endsWith('.js') || patch.targetFile.endsWith('.html')) {
        // Try to insert before the last closing tag
        if (currentCode.includes('</body>')) {
            return currentCode.replace('</body>', `${newSnippet}\n</body>`);
        }
        if (currentCode.includes('</script>')) {
             // Insert before the LAST script tag closes
             const lastScriptIdx = currentCode.lastIndexOf('</script>');
             return currentCode.substring(0, lastScriptIdx) + '\n' + newSnippet + '\n' + currentCode.substring(lastScriptIdx);
        }
        // Just append
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
  if (isFullHtml || patch.action === 'create' || currentCode.trim().length === 0) {
      return { newCode: newSnippet, success: true };
  }
  
  if (patch.action === 'delete') {
      return { newCode: '', success: true };
  }

  if (!originalSnippet) {
      // If no original snippet provided for update, try fallback injection
      const injected = fallbackInject(currentCode, patch);
      if (injected) return { newCode: injected, success: true };
      return { newCode: currentCode, success: false, error: "Snippet original ausente." };
  }

  // 2. Strategy A: Exact Match (Fastest, Safest)
  const exact = exactReplace(currentCode, originalSnippet, newSnippet);
  if (exact) return { newCode: exact, success: true };

  // 3. Strategy B: Token Sliding Window (The Savior)
  // Ignores all punctuation differences, whitespace, indentation issues.
  const fuzzy = tokenBasedReplace(currentCode, originalSnippet, newSnippet);
  if (fuzzy) return { newCode: fuzzy, success: true };

  // 4. Strategy C: Fallback Injection (Last Resort)
  // If we really can't find where to put it, but it looks like a new feature, append it.
  const injected = fallbackInject(currentCode, patch);
  if (injected) {
      console.warn("Patch applied via Fallback Injection (Append)");
      return { newCode: injected, success: true };
  }

  // 5. Fail
  console.warn("Patch failed completely:", patch.description);
  console.log("Original Snippet causing fail:", originalSnippet);
  return { 
      newCode: currentCode, 
      success: false, 
      error: "Could not locate original snippet. Even fuzzy match failed." 
  };
};

export const formatHTML = (html: string): string => {
  return html;
};
