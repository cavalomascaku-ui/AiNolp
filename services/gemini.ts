
import { GoogleGenAI, GenerateContentResponse, Type, Schema } from "@google/genai";
import { AiResponse, ProjectFiles, Attachment, CodePatch, PlatformTarget } from '../types';

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

const sanitizeInputContext = (files: ProjectFiles): ProjectFiles => {
    const cleanFiles: ProjectFiles = {};
    for (const [name, content] of Object.entries(files)) {
        let clean = content.replace(/<<<<<<< HEAD/g, '').replace(/======/g, '').replace(/>>>>>>>/g, '');
        cleanFiles[name] = clean;
    }
    return cleanFiles;
};

const cleanJsonString = (str: string): string => {
  if (!str) return "{}";
  let cleaned = str.replace(/```json\s*/g, "").replace(/```\s*$/g, "");
  cleaned = cleaned.replace(/```\s*/g, ""); 
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, ''); 
  
  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      return cleaned.substring(firstOpen, lastClose + 1);
  }
  
  return cleaned;
};

const resilientJsonParse = (str: string): any => {
    try { 
        return JSON.parse(str); 
    } catch (e) { 
        try {
            let fixed = str;
            fixed = fixed.replace(/}\s*{/g, '},{');
            fixed = fixed.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
            return JSON.parse(fixed);
        } catch (e2) {}

        const patches: CodePatch[] = [];
        const regex = /"targetFile"\s*:\s*"([^"]+)"[\s\S]*?"action"\s*:\s*"([^"]+)"[\s\S]*?"newSnippet"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        
        let match;
        while ((match = regex.exec(str)) !== null) {
             patches.push({
                 targetFile: match[1],
                 action: match[2] as any,
                 newSnippet: match[3].replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
                 description: "Recovered from partial JSON"
             });
        }
        
        if (patches.length > 0) {
            return { thoughtProcess: "Parsed via Regex Fallback", patches };
        }
        return { patches: [] }; 
    }
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
    const cleanFiles = sanitizeInputContext(files);
    
    const fileContext = Object.entries(cleanFiles)
        .map(([name, content]) => `FILENAME: ${name}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');

    const SYSTEM_PROMPT = `
You are an Expert Game Engine Architect.
Your goal is to modify the provided code to fulfill the User Request.

*** CRITICAL RULES FOR CODE PATCHING (STRICT) ***

1. **REPLACE WHOLE BLOCKS**:
   - DO NOT replace single lines inside a function.
   - REPLACE THE ENTIRE FUNCTION or THE ENTIRE CSS RULE.
   - This ensures the "Search & Replace" system can find the unique context.

2. **COPY EXACTLY**: 
   - \`originalSnippet\` must be a copy of the existing code.
   - If you change a function, copy the OLD function completely into \`originalSnippet\`.

3. **NO HALLUCINATIONS**: 
   - Verify that \`originalSnippet\` exists in the provided FILES.

4. **USE "CREATE" FOR SAFETY**:
   - If a file is small (< 50 lines), just overwrite it using \`action: "create"\` with the full new content. It is safer than patching.
   - If you are unsure about the context, use \`create\` to rewrite the file.

ACTIONS:
- "update": Replace a specific block (Function/Class/StyleRule).
- "create": Create/Overwrite a file.
- "delete": Delete a file.

JSON RESPONSE FORMAT:
{
  "thoughtProcess": "Explanation...",
  "patches": [
    {
      "targetFile": "filename.ext",
      "action": "update",
      "description": "Short description",
      "originalSnippet": "exact code from file",
      "newSnippet": "new code to replace it"
    }
  ]
}
`;

    const userMessage = `
FILES:
${fileContext}

REQUEST:
${technicalPrompt}

PLATFORM: ${platform}
`;

    let fullText = "";
    try {
        if (provider === 'google') {
            const ai = new GoogleGenAI({ apiKey: getApiKey('google') });
            const responseSchema: Schema = {
                type: Type.OBJECT,
                properties: {
                    thoughtProcess: { type: Type.STRING },
                    patches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { targetFile: { type: Type.STRING }, action: { type: Type.STRING }, description: { type: Type.STRING }, originalSnippet: { type: Type.STRING }, newSnippet: { type: Type.STRING } } } }
                },
                required: ["patches"]
            };

            const result = await ai.models.generateContentStream({
                model: GOOGLE_FLASH_MODEL,
                contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + "\n" + userMessage }] }],
                config: { temperature: 0.1, responseMimeType: "application/json", responseSchema: responseSchema }
            });

            for await (const chunk of result) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    if (onChunk) onChunk(text);
                }
            }
        } else {
             // OpenRouter implementation
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
        throw new Error("AI Generation Failed: " + e.message);
    }
};
