import { GoogleGenAI } from "@google/genai";
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

// Mantendo o modelo Pro para melhor lógica de código
const GOOGLE_MODEL = 'gemini-3-pro-preview'; 

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
  let cleaned = str.replace(/```json\s*/g, "").replace(/```\s*$/g, "").replace(/```/g, "");
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, ''); 
  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      cleaned = cleaned.substring(firstOpen, lastClose + 1);
  } else {
      return "{}"; 
  }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  return cleaned.trim();
};

const resilientJsonParse = (str: string): any => {
    try { return JSON.parse(str); } catch (e) { 
        console.error("JSON PARSE FAILED", str);
        throw new Error("A IA gerou uma resposta inválida. Tente novamente."); 
    }
};

export const validateConnection = async (provider: 'google' | 'openrouter', apiKey: string, model?: string): Promise<{ success: boolean; message: string }> => {
    try {
        if (provider === 'google') {
            const ai = new GoogleGenAI({ apiKey });
            await ai.models.generateContent({ model: GOOGLE_MODEL, contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] });
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
    platform: PlatformTarget = 'both',
    onStatusUpdate?: (status: string) => void
): Promise<AiResponse> => {
    const provider = (typeof localStorage !== 'undefined' && localStorage.getItem('custom_llm_provider') === 'openrouter') ? 'openrouter' : 'google';
    
    // REMOVIDO: Toda lógica de busca 3D/Sketchfab. A IA agora focará puramente no código.

    const cleanFiles = sanitizeInputContext(files);
    const fileContext = Object.entries(cleanFiles)
        .map(([name, content]) => `FILENAME: ${name}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');

    const SYSTEM_PROMPT = `
You are a Senior Game & Web Developer using Gemini 3 Pro.
Your task is to EDIT existing code files to fulfill the user request.

*** CRITICAL RULES ***
1. **LANGUAGE**: You can use HTML5/JS/CSS *OR* React (JSX/TSX).
2. **REACT MODE**: 
   - If the user asks for React or the files contain .tsx/.jsx, use React 18+ Functional Components.
   - Use 'import React from "react"'.
   - The entry point for React must be a 'main.tsx' or 'index.tsx' that finds 'root' and renders the App.
   - Example Entry: \`ReactDOM.createRoot(document.getElementById('root')!).render(<App />)\`
3. **NO BUILD STEPS**: The environment runs in-browser. 
   - DO NOT use \`npm install\`.
   - DO NOT use complicated configs (webpack/vite). 
   - Standard imports (ESM) work for local files.
   - External libs must be standard ESM or simple script tags.
4. **NO HALLUCINATED URLS**: Do NOT invent URLs like 'assets/player.png'. Use procedural graphics (Canvas/CSS) or placeholders.

*** OUTPUT FORMAT ***
You MUST stream the response in this EXACT order. The 'thoughtProcess' MUST come first and be detailed so the user sees you thinking.

JSON FORMAT:
{
  "thoughtProcess": "Step 1: Analyze user request. Step 2: Check current file structure. Step 3: Plan changes... (Be verbose here)",
  "patches": [
    {
      "targetFile": "filename.ext",
      "action": "update", // or "create" or "delete"
      "description": "What is changing",
      "originalSnippet": "exact code to replace",
      "newSnippet": "new code"
    }
  ]
}

*** EDITING STRATEGY ***
- Return valid JSON.
- Use "originalSnippet" to anchor your changes.
- If the file is empty or new, use "action": "create" with the FULL content.
- If a file is no longer needed (e.g. cleanup), use "action": "delete".
`;

    // INJEÇÃO DE ANEXOS (Imagens enviadas pelo user)
    let attachmentInstructions = "";
    if (attachments && attachments.length > 0) {
        attachmentInstructions = `
*** ATTACHMENTS ***
The user attached ${attachments.length} images.
The system has pre-loaded them.
You MUST use these placeholders in your code where you want the images to appear:
${attachments.map((_, i) => `- Image ${i+1}: "__ATTACHMENT_${i}__"`).join('\n')}
`;
    }

    const userMessage = `
CURRENT FILES:
${fileContext}

USER REQUEST:
${technicalPrompt}

${attachmentInstructions}

TARGET PLATFORM: ${platform}
`;

    let fullText = "";
    try {
        if (onStatusUpdate) onStatusUpdate("Conectando ao núcleo neural...");
        
        if (provider === 'google') {
            const ai = new GoogleGenAI({ apiKey: getApiKey('google') });
            const result = await ai.models.generateContentStream({
                model: GOOGLE_MODEL,
                contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + "\n" + userMessage }] }],
                config: { 
                    temperature: 0.1, 
                    responseMimeType: "application/json"
                }
            });

            for await (const chunk of result) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    if (onChunk) onChunk(text);
                }
            }
        } else {
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
        const parsed: AiResponse = resilientJsonParse(jsonStr);
        
        if (parsed.patches && Array.isArray(parsed.patches)) {
            parsed.patches = parsed.patches.map(p => ({
                ...p,
                targetFile: p.targetFile.replace(/\.html\.html$/i, '.html')
                                      .replace(/\.js\.js$/i, '.js')
                                      .replace(/\.css\.css$/i, '.css')
            }));
        } else {
            parsed.patches = [];
        }

        return parsed;

    } catch (e: any) {
        throw new Error("AI Generation Failed: " + e.message);
    }
};