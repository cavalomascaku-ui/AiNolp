
import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { AiResponse, ProjectFiles, Attachment, ImageResult, SearchSourceType, CodePatch, PlatformTarget } from '../types';

// Função auxiliar para obter a API Key
const getApiKey = (provider: 'google' | 'openrouter') => {
  let apiKey = process.env.API_KEY; 
  if (typeof localStorage !== 'undefined') {
    const customKey = localStorage.getItem('custom_gemini_api_key');
    if (customKey && customKey.trim().length > 0) apiKey = customKey;
  }
  return apiKey || ''; 
};

const GOOGLE_FLASH_MODEL = 'gemini-3-flash-preview'; 

// Simple fetch for internal use
async function simpleFetch(url: string): Promise<string | null> {
    try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        if (res.ok) return await res.text();
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * LIMPEZA DE ENTRADA (CONTEXT CLEANER)
 * Remove linhas repetidas e lixo que fazem a IA entrar em loop.
 */
const sanitizeInputContext = (files: ProjectFiles): ProjectFiles => {
    const cleanFiles: ProjectFiles = {};
    for (const [name, content] of Object.entries(files)) {
        let clean = content;
        // Remove padrões de conflito de merge ou lixo de repetição
        clean = clean.replace(/<<<<<<< HEAD/g, '').replace(/======/g, '').replace(/>>>>>>>/g, '');
        
        const lines = clean.split('\n');
        const dedupedLines: string[] = [];
        let lastLine = '';
        let repetitionCount = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            // Ignora linhas vazias repetidas ou lixo puro
            if (trimmed.length === 0 && lastLine.length === 0) continue;
            
            if (trimmed === lastLine && trimmed.length > 2) { // Só deduplica se a linha tiver conteúdo relevante
                repetitionCount++;
                if (repetitionCount < 3) { 
                    dedupedLines.push(line);
                }
            } else {
                repetitionCount = 0;
                lastLine = trimmed;
                dedupedLines.push(line);
            }
        }
        cleanFiles[name] = dedupedLines.join('\n');
    }
    return cleanFiles;
};

/**
 * REPARADOR ROBUSTO DE JSON
 */
const cleanJsonString = (str: string): string => {
  if (!str) return "{}";
  let cleaned = str.replace(/```json\n?|```/g, "").trim();
  // Remove comentários JS que a IA as vezes coloca no JSON
  cleaned = cleaned.replace(/\/\/.*$/gm, ''); 
  const firstOpen = cleaned.indexOf('{');
  if (firstOpen === -1) return "{}";
  cleaned = cleaned.substring(firstOpen);
  return cleaned;
};

const resilientJsonParse = (str: string): any => {
    try { return JSON.parse(str); } catch (e) { 
        console.error("JSON Parse Error", e);
        // Fallback: Tenta recuperar patches via Regex se o JSON quebrou
        const patches = [];
        const regex = /"targetFile"\s*:\s*"([^"]+)"[\s\S]*?"action"\s*:\s*"([^"]+)"[\s\S]*?"newSnippet"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        let match;
        while ((match = regex.exec(str)) !== null) {
             patches.push({
                 targetFile: match[1],
                 action: match[2],
                 newSnippet: match[3].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                 description: "Recovered from broken JSON"
             });
        }
        if (patches.length > 0) return { patches };
        return { patches: [] }; 
    }
};

// --- SEARCH FUNCTIONS ---
const searchReddit = async (query: string): Promise<ImageResult[]> => {
    try {
        // CORREÇÃO: Remove operadores de Google Search que quebram a API do Reddit
        const cleanQuery = query.replace(/[()]/g, '').replace(/site:[\w.]+/g, '').trim();
        const targetSubreddits = 'gameassets+pixelart+sprites+textures+unity2d+gamedev+indiedev';
        const url = `https://www.reddit.com/r/${targetSubreddits}/search.json?q=${encodeURIComponent(cleanQuery)}&restrict_sr=1&sort=top&limit=30&t=all`;
        
        const jsonStr = await simpleFetch(url);
        if (!jsonStr) return [];
        const data = JSON.parse(jsonStr);
        return (data.data?.children || []).map((child: any) => {
                const post = child.data;
                let imgUrl = post.url_overridden_by_dest || post.url;
                if (!imgUrl || (!imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))) return null;
                return { url: imgUrl, thumbnail: post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : imgUrl, title: post.title, source: `reddit/${post.subreddit}`, type: 'image' } as ImageResult;
            }).filter(Boolean);
    } catch (e) { return []; }
};

const searchLexica = async (query: string): Promise<ImageResult[]> => {
    try {
        // Melhora a query para Lexica
        const enhancedQuery = query.includes('sprite') ? query : query + " game asset style flat 2d";
        const url = `https://lexica.art/api/v1/search?q=${encodeURIComponent(enhancedQuery)}`;
        const jsonStr = await simpleFetch(url);
        if (!jsonStr) return [];
        const data = JSON.parse(jsonStr);
        return (data.images || []).slice(0, 30).map((img: any) => ({ url: img.src, thumbnail: img.srcSmall, title: img.prompt, source: 'lexica', type: 'image' }));
    } catch (e) { return []; }
}

const searchItchIo = async (query: string): Promise<ImageResult[]> => {
    try {
        const url = `https://itch.io/search?q=${encodeURIComponent(query + " assets")}`;
        const html = await simpleFetch(url);
        if (!html) return [];
        const results: ImageResult[] = [];
        const regex = /data-background_image="([^"]+)"/g;
        let match;
        let count = 0;
        while ((match = regex.exec(html)) !== null && count < 15) {
            results.push({ url: match[1], title: query, source: 'itchio', type: 'image' });
            count++;
        }
        return results;
    } catch(e) { return []; }
}

export const searchImagesWithAi = async (query: string, filters: string[], sources: SearchSourceType[]): Promise<ImageResult[]> => {
    // 1. Enriquecer a Query se ela for muito curta
    let enhancedQuery = query;
    if (query.split(' ').length < 3) {
        if (filters.includes('spritesheet')) enhancedQuery += " sprite sheet game asset";
        else if (filters.includes('texture')) enhancedQuery += " seamless texture pattern";
        else enhancedQuery += " game asset 2d";
    }

    const results: ImageResult[] = [];
    const promises: Promise<ImageResult[]>[] = [];
    
    // Prioriza fontes de qualidade
    if (sources.includes('lexica')) promises.push(searchLexica(enhancedQuery));
    if (sources.includes('reddit')) promises.push(searchReddit(query));
    if (sources.includes('itchio')) promises.push(searchItchIo(query));
    
    const allResults = await Promise.all(promises);
    allResults.forEach(r => results.push(...r));
    return Array.from(new Map(results.map(item => [item.url, item])).values()).sort(() => Math.random() - 0.5);
};

export const validateConnection = async (provider: 'google' | 'openrouter', apiKey: string, model?: string): Promise<{ success: boolean; message: string }> => {
    try {
        if (provider === 'google') {
            const ai = new GoogleGenAI({ apiKey });
            await ai.models.generateContent({ model: GOOGLE_FLASH_MODEL, contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] });
            return { success: true, message: 'Google Gemini Connected!' };
        } else {
            const testModel = model || 'google/gemini-2.0-flash-lite-preview-02-05:free';
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: testModel, messages: [{ role: "user", content: "Hi" }] }) });
            if (res.ok) return { success: true, message: 'OpenRouter Connected!' };
            throw new Error(await res.text());
        }
    } catch (e: any) { return { success: false, message: e.message || 'Connection failed' }; }
};

export const analyzeAndEditCode = async (
    files: ProjectFiles,
    technicalPrompt: string,
    attachments: Attachment[] = [],
    forceThinking: boolean = false,
    mode: boolean = false, 
    onChunk?: (chunk: string) => void,
    platform: PlatformTarget = 'both'
): Promise<AiResponse> => {
    const provider = (typeof localStorage !== 'undefined' && localStorage.getItem('custom_llm_provider') === 'openrouter') ? 'openrouter' : 'google';
    
    // 1. SANITIZAR ARQUIVOS (Evita Loops na Entrada)
    const cleanFiles = sanitizeInputContext(files);
    
    // Simplifica o contexto (envia menos lixo)
    const fileContext = Object.entries(cleanFiles)
        .map(([name, content]) => `FILENAME: ${name}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');

    const SYSTEM_PROMPT = `
You are an Expert Game Engine Architect and Senior JavaScript Developer.
Your code MUST be syntactically correct.

TASK:
Analyze the PROJECT FILES and the USER REQUEST.
Return a JSON object with 'patches' to modify the code.

STRICT CODING RULES:
1. **NO PLACEHOLDERS**: Never use "// ... code ...", "// existing logic", or "// rest of function". YOU MUST WRITE FULL BLOCKS or use correct replacement logic.
2. **CHECK YOUR BRACKETS**: Ensure every '{' has a '}' and every '(' has a ')'. Unclosed brackets CRASH the app.
3. **COMPLETE FUNCTIONS**: If modifying a function, overwrite the WHOLE function to be safe.
4. **GAME LOOP**: If creating a game, ensure there is a \`requestAnimationFrame\` loop and a \`canvas\`.
5. **ASSETS**: If the user asks for images, assume generic placeholders (colored rects) or use provided image URLs.

JSON RESPONSE FORMAT:
{
  "thoughtProcess": "Short explanation of logic.",
  "patches": [
    {
      "targetFile": "index.html",
      "action": "update", 
      "originalSnippet": "EXACT CODE TO REPLACE (COPY PASTE FROM INPUT)",
      "newSnippet": "NEW CODE (COMPLETE, VALID JS/HTML)"
    }
  ],
  "suggestedAssetQuery": "Optional: search query for images if needed"
}

IF CREATING A NEW GAME:
Use "action": "create" (or "update" on index.html) and write the **ENTIRE** HTML file in 'newSnippet'. Do not try to patch an empty file.
`;

    const userMessage = `
FILES:
${fileContext}

REQUEST:
${technicalPrompt}

PLATFORM: ${platform}
`;

    let fullText = "";
    // TRAVA DE SEGURANÇA: Limite de ocorrências de "targetFile" para evitar loop infinito
    let targetFileSpamCount = 0;
    const SPAM_LIMIT = 15;

    try {
        if (provider === 'google') {
            const ai = new GoogleGenAI({ apiKey: getApiKey('google') });
            
            const responseSchema: Schema = {
                type: Type.OBJECT,
                properties: {
                    thoughtProcess: { type: Type.STRING },
                    patches: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: {
                                targetFile: { type: Type.STRING },
                                action: { type: Type.STRING },
                                description: { type: Type.STRING },
                                originalSnippet: { type: Type.STRING },
                                newSnippet: { type: Type.STRING },
                            }
                        } 
                    },
                    suggestedAssetQuery: { type: Type.STRING }
                },
                required: ["patches"]
            };

            const result = await ai.models.generateContentStream({
                model: GOOGLE_FLASH_MODEL,
                contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + "\n" + userMessage }] }],
                config: {
                   temperature: 0.4, // Menor temperatura para código mais preciso
                   responseMimeType: "application/json",
                   responseSchema: responseSchema
                }
            });

            for await (const chunk of result) {
                // CORRIGIDO: .text é uma propriedade getter, não um método
                const text = chunk.text;
                
                if (text) {
                    fullText += text;

                    // CIRCUIT BREAKER
                    if (text.includes('targetFile')) {
                        targetFileSpamCount++;
                        if (targetFileSpamCount > SPAM_LIMIT) {
                            throw new Error("ABORTING: AI Loop Detected (Too many file patches).");
                        }
                    }

                    if (onChunk) onChunk(text);
                }
            }
        } else {
             // OpenRouter Logic with Manual Circuit Breaker
             const customKey = getApiKey('openrouter');
             const customModel = localStorage.getItem('custom_llm_model') || 'google/gemini-2.0-flash-lite-preview-02-05:free';
             const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${customKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: customModel,
                    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
                    stream: true,
                    response_format: { type: "json_object" }
                })
            });
            if (!response.body) throw new Error("No response");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            fullText += content;
                            
                            // CIRCUIT BREAKER
                            if (content.includes('targetFile')) {
                                targetFileSpamCount++;
                                if (targetFileSpamCount > SPAM_LIMIT) {
                                    throw new Error("ABORTING: AI Loop Detected (Too many file patches).");
                                }
                            }
                            
                            if (onChunk) onChunk(content);
                        } catch (e) {}
                    }
                }
            }
        }
        
        const jsonStr = cleanJsonString(fullText);
        const parsed = resilientJsonParse(jsonStr);
        return parsed as AiResponse;

    } catch (e: any) {
        if (e.message.includes("ABORTING")) {
             console.warn("AI Loop aborted by Circuit Breaker.");
             // Tenta recuperar o que foi gerado até agora se for JSON válido
             try {
                const safeJson = cleanJsonString(fullText + "]}"); // Fecha o JSON na marra
                return resilientJsonParse(safeJson);
             } catch(err) {
                 throw new Error("IA entrou em loop e a resposta foi descartada.");
             }
        }
        throw new Error("AI Generation Failed: " + e.message);
    }
};
