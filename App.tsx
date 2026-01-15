import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { CodeEditor } from './components/Editor';
import { Preview } from './components/Preview';
import { AgentStatusOverlay } from './components/AgentStatus';
import { analyzeAndEditCode, validateConnection } from './services/gemini';
import { applyPatch, formatHTML } from './utils/patcher';
import { ChatMessage, AppTab, AgentStatus, CodePatch, RuntimeError, ProjectFiles, AgentLog, PlatformTarget, EditorThemeColors, Attachment, AiResponse } from './types';
import { Send, Code, Play, MessageSquare, Upload, Zap, Terminal, MonitorPlay, Sparkles, Download, Undo2, Redo2, AlertTriangle, Bug, BrainCircuit, X, Users, Wrench, ChevronDown, Trash2, Rocket, FilePlus, FileText, Layout, FolderOpen, Paperclip, FileImage, Loader2, CheckCircle2, Info, Package, PanelLeft, Search, File as FileIcon, Gamepad2, Globe, Copy, Layers, ShieldAlert, Clapperboard, Film, Lock, Unlock, CheckSquare, Square, RefreshCw, Sparkles as AiSparkles, Sword, Globe2, Plus, Image as ImageIcon, ExternalLink, Settings, KeyRound, Eye, EyeOff, Server, Cpu, Wifi, WifiOff, FileEdit, MoreVertical, Smartphone, Monitor, Laptop, Palette, BookOpen, StickyNote, FileCode, Check, PenTool, Lightbulb, ArrowRight } from 'lucide-react';
import JSZip from 'jszip';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// --- ERROR BOUNDARY (Proteção contra Tela Preta) ---
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught Error in UI:", error, errorInfo);
  }

  handleReset = () => {
      this.setState({ hasError: false, error: null });
      window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
            <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Ops! Ocorreu um erro crítico.</h2>
            <p className="text-zinc-400 max-w-md mb-6 text-sm">
                O aplicativo encontrou um problema inesperado (provavelmente ao processar um arquivo grande ou complexo).
            </p>
            <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-red-300 mb-6 max-w-lg w-full overflow-auto max-h-32">
                {this.state.error?.message || 'Erro desconhecido'}
            </div>
            <button 
                onClick={this.handleReset}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
            >
                <RefreshCw className="w-4 h-4" /> Recarregar App
            </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const INITIAL_FILES: ProjectFiles = {
  'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            margin: 0; 
            background: #000000; 
            color: #ffffff; 
            font-family: monospace; 
            display: flex; 
            flex-direction: column;
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            text-align: center;
        }
        h2 { font-weight: bold; color: #ffffff; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 2px; }
        p { color: #888; }
    </style>
</head>
<body>
    <div>
        <h2>Novo Projeto</h2>
        <p>Aguardando instruções...</p>
    </div>
</body>
</html>`
};

const DEFAULT_CUSTOM_THEME: EditorThemeColors = {
    background: '#09090b',
    foreground: '#F8F8F2',
    keyword: '#FF79C6',
    string: '#F1FA8C',
    function: '#50FA7B',
    comment: '#6272A4',
    number: '#BD93F9'
};

const FREE_OPENROUTER_MODELS = [
    { id: "google/gemini-2.0-flash-lite-preview-02-05:free", name: "Gemini 2.0 Flash Lite", tags: ["Rápido", "Geral", "Novo"], desc: "Modelo muito rápido e capaz do Google. Ótimo para tarefas gerais." },
    { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 3 (405B)", tags: ["Uncensored", "Coding", "God Tier"], desc: "O modelo open-source mais inteligente. Sem filtros morais, excelente para código complexo." },
    { id: "gryphe/mythomax-l2-13b:free", name: "MythoMax 13B", tags: ["Roleplay", "NSFW", "Creative"], desc: "O rei do Roleplay sem censura. Entende contextos adultos perfeitamente." },
    { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", tags: ["Raciocínio", "Coding", "Top Tier"], desc: "Excelente para lógica complexa e código. Um dos melhores open source." },
    { id: "deepseek/deepseek-v3:free", name: "DeepSeek V3", tags: ["Geral", "Equilibrado"], desc: "Versão V3 estável, boa para chat e instruções diretas." },
    { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B", tags: ["Leve", "Rápido"], desc: "Modelo leve e eficiente para respostas curtas." },
];

const CREATIVE_PRESETS = [
    { id: 'cyberpunk', label: 'Neon Cyberpunk', desc: 'Escuro, neons, glitch.', colors: 'from-pink-600 to-purple-600' },
    { id: 'minimal', label: 'Minimal Clean', desc: 'Branco, clean, tipografia.', colors: 'from-gray-200 to-gray-400 text-black' },
    { id: 'paper', label: 'Paper Note', desc: 'Feito à mão, papel, lúdico.', colors: 'from-yellow-100 to-orange-100 text-black' }, 
    { id: 'retro', label: 'Retro 8-Bit', desc: 'Pixel art, cores primárias.', colors: 'from-green-500 to-yellow-500' },
    { id: 'dark_souls', label: 'Dark Fantasy', desc: 'Gótico, vermelho escuro.', colors: 'from-red-900 to-black' },
    { id: 'arcade', label: 'Arcade Pop', desc: 'Vibrante, divertido, bouncy.', colors: 'from-orange-500 to-yellow-400' }
];

const convertToSupportedImage = (blob: Blob): Promise<Blob> => {
  return new Promise((resolve) => {
      // Se for muito grande, a gente rejeita ou comprime (Aqui vamos manter simples, mas seguro)
      if (blob.size > 5 * 1024 * 1024) { // 5MB Limit
          console.warn("Imagem muito grande para processamento direto.");
          resolve(blob); 
          return;
      }

      if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(blob.type)) {
          resolve(blob);
          return;
      }
      if (!blob.type.startsWith('image/')) {
           resolve(blob);
           return;
      }
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
          const canvas = document.createElement('canvas');
          // Redimensionar se for gigante para evitar OOM
          const MAX_DIM = 2048;
          let width = img.width;
          let height = img.height;
          
          if (width > MAX_DIM || height > MAX_DIM) {
              const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
              width *= ratio;
              height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((newBlob) => {
                  URL.revokeObjectURL(url);
                  if (newBlob) resolve(newBlob);
                  else resolve(blob);
              }, 'image/png', 0.8);
          } else {
              URL.revokeObjectURL(url);
              resolve(blob);
          }
      };
      
      img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(blob); 
      }
      img.src = url;
  });
};

function AppContent() {
  const [files, setFiles] = useState<ProjectFiles>(INITIAL_FILES);
  const [activeFilename, setActiveFilename] = useState<string>('index.html');
  const [history, setHistory] = useState<ProjectFiles[]>([INITIAL_FILES]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', content: 'Olá! Sou seu Arquiteto de Software. Vamos criar um projeto organizado em arquivos?' }
  ]);
  const [input, setInput] = useState('');
  const [lastPrompt, setLastPrompt] = useState(''); 
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.PREVIEW);
  
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ 
      isActive: false, 
      mode: 'idle', 
      logs: [], 
      progress: 0, 
      estimatedSeconds: 0 
  });
  
  const [streamedResponse, setStreamedResponse] = useState('');

  const [refreshKey, setRefreshKey] = useState(0);
  const [runtimeError, setRuntimeError] = useState<RuntimeError | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false); 
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  
  const [isGameMode, setIsGameMode] = useState(() => {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('devgame_mode');
        return saved === 'game' ? true : false; 
    }
    return false; 
  });
  
  const [platformTarget, setPlatformTarget] = useState<PlatformTarget>('both');

  const [editorTheme, setEditorTheme] = useState('devgame-neon');
  const [customThemeColors, setCustomThemeColors] = useState<EditorThemeColors>(DEFAULT_CUSTOM_THEME);
  const [showThemePanel, setShowThemePanel] = useState(false);
  
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [creativeStyle, setCreativeStyle] = useState('');
  const [creativeInstruction, setCreativeInstruction] = useState('');
  
  const [pendingCreativeUpdate, setPendingCreativeUpdate] = useState<AiResponse | null>(null);
  const [highlightSnippet, setHighlightSnippet] = useState<string | undefined>(undefined);
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const [pendingAssetContext, setPendingAssetContext] = useState(''); 
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [fileSearch, setFileSearch] = useState('');

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadName, setDownloadName] = useState('meu-projeto');
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customInstructions, setCustomInstructions] = useState(''); 
  const [llmProvider, setLlmProvider] = useState<'google' | 'openrouter'>('google');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  
  const [showModelGallery, setShowModelGallery] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('devgame_mode', isGameMode ? 'game' : 'web');
  }, [isGameMode]);

  useEffect(() => {
    if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
    }
    
    if (typeof localStorage !== 'undefined') {
        const savedKey = localStorage.getItem('custom_gemini_api_key');
        if (savedKey) setCustomApiKey(savedKey);
        const savedModel = localStorage.getItem('custom_llm_model');
        if (savedModel) setCustomModel(savedModel);
        const savedProvider = localStorage.getItem('custom_llm_provider');
        if (savedProvider === 'openrouter') setLlmProvider('openrouter');
        const savedInstructions = localStorage.getItem('devgame_custom_instructions');
        if (savedInstructions) setCustomInstructions(savedInstructions);
        const savedTheme = localStorage.getItem('devgame_editor_theme');
        if (savedTheme) setEditorTheme(savedTheme);
        const savedCustomColors = localStorage.getItem('devgame_custom_colors');
        if (savedCustomColors) {
            try { setCustomThemeColors(JSON.parse(savedCustomColors)); } catch (e) {}
        }
    }
  }, []);

  useEffect(() => {
      localStorage.setItem('devgame_editor_theme', editorTheme);
      if (editorTheme === 'custom') {
          localStorage.setItem('devgame_custom_colors', JSON.stringify(customThemeColors));
      }
  }, [editorTheme, customThemeColors]);

  const saveSettings = () => { localStorage.setItem('custom_gemini_api_key', customApiKey.trim()); localStorage.setItem('custom_llm_model', customModel.trim()); localStorage.setItem('custom_llm_provider', llmProvider); localStorage.setItem('devgame_custom_instructions', customInstructions); setShowSettingsModal(false); setConnectionStatus('idle'); const providerName = llmProvider === 'openrouter' ? 'OpenRouter' : 'Google Gemini'; alert(`Configurações salvas!\nProvider: ${providerName}\nModel: ${customModel || '(Auto)'}`); };
  const clearSettings = () => { localStorage.removeItem('custom_gemini_api_key'); localStorage.removeItem('custom_llm_model'); localStorage.removeItem('custom_llm_provider'); localStorage.removeItem('devgame_custom_instructions'); setCustomApiKey(''); setCustomModel(''); setCustomInstructions(''); setLlmProvider('google'); setConnectionStatus('idle'); alert("Configurações resetadas para o padrão (Google Gemini)."); };
  const handleTestConnection = async () => { setConnectionStatus('testing'); setConnectionMessage('Testando conexão...'); const result = await validateConnection(llmProvider, customApiKey, customModel); if (result.success) { setConnectionStatus('success'); setConnectionMessage(result.message); } else { setConnectionStatus('error'); setConnectionMessage(result.message); } };
  const closeUpdateModal = () => { localStorage.setItem('devgame_version', 'v4.0.2'); setShowUpdateModal(false); };

  const updateFilesWithHistory = (newFiles: ProjectFiles) => { const newHistory = history.slice(0, historyIndex + 1); newHistory.push(newFiles); setHistory(newHistory); setHistoryIndex(newHistory.length - 1); setFiles(newFiles); };
  const handleUndo = () => { if (historyIndex > 0) { const newIndex = historyIndex - 1; setHistoryIndex(newIndex); setFiles(history[newIndex]); setHighlightSnippet(undefined); setRuntimeError(null); } };
  const handleRedo = () => { if (historyIndex < history.length - 1) { const newIndex = historyIndex + 1; setHistoryIndex(newIndex); setFiles(history[newIndex]); setHighlightSnippet(undefined); setRuntimeError(null); } };
  const handleCreateFile = () => { const name = prompt("Nome do arquivo (ex: js/player.js):"); if (name && name.trim()) { const fileName = name.trim(); if (files[fileName]) return alert("Arquivo já existe."); const newFiles = { ...files, [fileName]: '' }; updateFilesWithHistory(newFiles); setActiveFilename(fileName); setActiveTab(AppTab.EDITOR); } };

  const handleDownload = async () => {
    setShowDownloadModal(false);
    const fileNames = Object.keys(files);
    const finalName = downloadName.trim() || 'meu-projeto';

    if (fileNames.length === 1 && fileNames[0].endsWith('html')) {
      const fileName = fileNames[0];
      const blob = new Blob([files[fileName]], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${finalName}.html`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    } else {
      const zip = new JSZip();
      fileNames.forEach(name => {
        zip.file(name, files[name]);
      });
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${finalName}.zip`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    }
  };

  const handleProjectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAgentStatus({ isActive: true, mode: 'coding', logs: [{message: 'Lendo arquivo...', timestamp: Date.now(), type: 'info'}], progress: 50, estimatedSeconds: 2 });
    if (file.name.toLowerCase().endsWith('.zip')) {
        const zip = new JSZip();
        try {
            const content = await zip.loadAsync(file);
            const newFiles: ProjectFiles = {};
            let mainFile = '';
            const entries = Object.entries(content.files);
            for (const [relativePath, zipEntry] of entries) {
                const entry = zipEntry as any;
                if (entry.dir) continue;
                if (relativePath.includes('__MACOSX') || relativePath.includes('.DS_Store')) continue;
                const ext = relativePath.split('.').pop()?.toLowerCase();
                if (['html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'xml', 'svg'].includes(ext || '')) {
                    const text = await entry.async('string');
                    newFiles[relativePath] = text;
                    if (!mainFile && (ext === 'html' || ext === 'htm')) {
                        mainFile = relativePath;
                    }
                }
            }
            if (Object.keys(newFiles).length > 0) {
                updateFilesWithHistory(newFiles);
                const preferred = Object.keys(newFiles).find(f => f.toLowerCase().includes('index.html')) || mainFile || Object.keys(newFiles)[0];
                setActiveFilename(preferred);
                setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: `📦 **ZIP Extraído**: ${Object.keys(newFiles).length} arquivos de código carregados.` }]);
                setActiveTab(AppTab.EDITOR);
                setIsSidebarOpen(true);
                setRefreshKey(prev => prev + 1);
            } else {
                alert("Nenhum arquivo de código suportado (html/js/css) encontrado no ZIP.");
            }
        } catch (err: any) {
            console.error(err);
            alert("Erro ao ler arquivo ZIP: " + err.message);
        } finally {
            setAgentStatus({ isActive: false, mode: 'idle', logs: [], progress: 0, estimatedSeconds: 0 });
        }
    } else {
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
            const newFiles = { [file.name]: text };
            updateFilesWithHistory(newFiles);
            setActiveFilename(file.name);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: `Arquivo "${file.name}" carregado. O projeto anterior foi substituído.` }]);
            setActiveTab(AppTab.EDITOR);
            setRefreshKey(prev => prev + 1);
            setAgentStatus({ isActive: false, mode: 'idle', logs: [], progress: 0, estimatedSeconds: 0 });
            }
        };
        reader.readAsText(file);
    }
    e.target.value = '';
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PREVIEW_ERROR') {
        const { message, line } = event.data.payload;
        if (message && message.includes('ResizeObserver')) return;
        
        // Ignore generic 'Script error.' if there is no line information, usually noise or CORS issues.
        if (message === 'Script error.' && !line) return;

        setRuntimeError(event.data.payload);
      }
      if (event.data && event.data.type === 'LINK_CLICK') {
          const href = event.data.payload as string;
          let targetFile = '';
          const cleanHref = href.split('#')[0].split('?')[0]; 
          if (files[cleanHref]) targetFile = cleanHref;
          else if (files[cleanHref.replace(/^\//, '')]) targetFile = cleanHref.replace(/^\//, '');
          else if (files[cleanHref + '.html']) targetFile = cleanHref + '.html';
          else if (files[cleanHref.replace(/^\//, '') + '.html']) targetFile = cleanHref.replace(/^\//, '') + '.html';
          if (targetFile) {
              setActiveFilename(targetFile);
              setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: `🔄 Navegando para: ${targetFile}` }]);
          } else {
              if (href.startsWith('http')) {
                  window.open(href, '_blank');
              } else {
                  setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: `⚠️ Arquivo não encontrado: ${href}` }]);
              }
          }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [files]);

  useEffect(() => { setRuntimeError(null); }, [refreshKey, activeFilename]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeTab]);

  const applyPatchesSequentially = async (patches: CodePatch[]) => {
    let currentFiles = { ...files }; 
    // CRITICAL: Keep track of active file locally to prevent "Black Screen" crash during rapid updates
    let currentActiveFile = activeFilename;

    setActiveTab(AppTab.EDITOR);
    setAgentStatus(prev => ({ ...prev, mode: 'coding', logs: [...prev.logs, { message: 'Iniciando aplicação de patches...', timestamp: Date.now(), type: 'info' }] }));

    let patchCount = 0;
    
    // SAFE GUARD: Loop protegido para evitar crash se um patch falhar drasticamente
    for (const patch of patches) {
      try {
          patchCount++;
          // Fallback para descrição se vier undefined
          const patchDesc = patch.description || `Aplicando alterações no arquivo ${patch.targetFile}`;
          
          setAgentStatus(prev => ({ ...prev, progress: 95 + ((patchCount / patches.length) * 5), logs: [...prev.logs, { message: patchDesc, timestamp: Date.now(), type: 'info' }] }));
          await new Promise(resolve => setTimeout(resolve, 600)); 
          
          const target = patch.targetFile || currentActiveFile;
          const fileContent = currentFiles[target] || '';
          
          if (patch.action === 'create' || (patch.targetFile === 'index.html' && fileContent.includes('Novo Projeto'))) {
             currentFiles[target] = patch.newSnippet || '';
             currentActiveFile = target;
             setActiveFilename(target);
          } else if (patch.action === 'delete') {
             delete currentFiles[target];
          } else {
            const result = applyPatch(fileContent, patch);
            if (result.success) {
               currentFiles[target] = result.newCode;
               
               // PREVENÇÃO DE CRASH DO MONACO EDITOR (Regex too large)
               // Se o snippet for muito grande (ex: base64 images), não tentamos destacar.
               if (patch.newSnippet && patch.newSnippet.length < 5000) {
                   setHighlightSnippet(patch.newSnippet);
               } else {
                   setHighlightSnippet(undefined);
               }

               if (target !== currentActiveFile) {
                   currentActiveFile = target;
                   setActiveFilename(target);
               }
            } else {
               setAgentStatus(prev => ({ ...prev, logs: [...prev.logs, { message: `⚠️ FALHA: ${patchDesc}`, timestamp: Date.now(), type: 'warning' }] }));
               // ALERTA VISUAL NO CHAT SE FALHAR
               setMessages(prev => [...prev, { 
                   id: Date.now().toString(), 
                   role: 'system', 
                   content: `❌ **Falha ao aplicar patch no arquivo '${target}'**.\nMotivo: O trecho de código original não foi encontrado exatamente como a IA descreveu. A IA pode tentar novamente ou você pode aplicar manualmente.` 
               }]);
            }
          }
          
          // SAFETY: Update state only if files actually exist
          if (Object.keys(currentFiles).length > 0) {
              setFiles({ ...currentFiles });
          }
      } catch (e) {
          console.error("Patch Error:", e);
      }
    }
    
    updateFilesWithHistory(currentFiles);
    setAgentStatus({ isActive: false, mode: 'idle', logs: [], progress: 100, estimatedSeconds: 0 });
    setRefreshKey(prev => prev + 1);
    // Note: We might leave highlightSnippet active for the last patch if it was small enough
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        } else {
            reject(new Error("Falha ao ler arquivo"));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleStreamChunk = (chunk: string) => {
      setStreamedResponse(prev => prev + chunk);
      setActiveTab(AppTab.EDITOR);
      setAgentStatus(prev => ({ 
          ...prev, 
          progress: Math.min(prev.progress + 0.2, 95) 
      }));
  };

  const processAiRequest = async (technicalPrompt: string, userVisibleMessage?: string, forceThinking: boolean = false, attachments: File[] = [], modeOverride?: boolean, requireConfirmation: boolean = false) => {
    if (agentStatus.isActive) return;
    setActiveTab(AppTab.EDITOR); 
    
    let displayMessage = userVisibleMessage || technicalPrompt;
    
    const attachmentPreviews = attachments.map(f => URL.createObjectURL(f));

    if (displayMessage && displayMessage.trim()) {
        setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'user', 
            content: displayMessage,
            attachments: attachmentPreviews.length > 0 ? attachmentPreviews : undefined 
        }]);
    }
    setInput('');
    setChatAttachments([]); 
    setRuntimeError(null); 
    setShowTools(false);
    setStreamedResponse(''); 

    const modeToUse = modeOverride !== undefined ? modeOverride : isGameMode;
    const isComplex = forceThinking || isThinkingMode || technicalPrompt.length > 100;
    const simMode = isComplex ? 'thinking' : 'coding';
    const eta = isComplex ? 60 : 25;
    setAgentStatus({ isActive: true, mode: simMode, logs: [], progress: 5, estimatedSeconds: eta });
    
    try {
      const processedAttachments: Attachment[] = [];
      for (const file of attachments) {
          try {
             const base64 = await fileToBase64(file);
             processedAttachments.push({ mimeType: file.type, data: base64 });
          } catch(err) {
              console.error("Falha ao processar anexo para IA", file.name, err);
          }
      }
      const response = await analyzeAndEditCode(files, technicalPrompt, processedAttachments, forceThinking || isThinkingMode, modeToUse, handleStreamChunk, platformTarget);
      
      if (processedAttachments.length > 0) {
          response.patches.forEach(patch => {
              if (patch.newSnippet) {
                  processedAttachments.forEach((att, idx) => {
                      const placeholder = `__ATTACHMENT_${idx}__`;
                      const dataUri = `data:${att.mimeType};base64,${att.data}`;
                      patch.newSnippet = patch.newSnippet!.split(placeholder).join(dataUri);
                  });
              }
          });
      }

      setAgentStatus(prev => ({ ...prev, progress: 100 }));
      
      if (requireConfirmation) {
          setAgentStatus({ isActive: false, mode: 'idle', logs: [], progress: 100, estimatedSeconds: 0 });
          setPendingCreativeUpdate(response);
          return;
      }

      await applyPatchesSequentially(response.patches);

      setMessages(prev => [...prev, { id: (Date.now() + 2).toString(), role: 'assistant', content: '✅ Processo finalizado.' }]);
    } catch (error: any) {
      console.error(error);
      setAgentStatus({ isActive: false, mode: 'idle', logs: [], progress: 0, estimatedSeconds: 0 });
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', content: error.message || 'Erro inesperado.' }]);
    }
  };

  const handleSendMessage = () => { 
      if (input.trim() || chatAttachments.length > 0) { 
          setLastPrompt(input); 
          let finalPrompt = input;
          if (pendingAssetContext) finalPrompt += pendingAssetContext;
          
          if (!finalPrompt.trim() && chatAttachments.length > 0) {
              finalPrompt = "Integre os arquivos visualmente anexados ao código. Use os placeholders __ATTACHMENT_X__ conforme instruído.";
          }

          processAiRequest(finalPrompt, input || (chatAttachments.length > 0 ? "Enviando anexos..." : ""), false, chatAttachments); 
          setPendingAssetContext('');
      } 
  };

  const handleRegenerate = () => { if (!lastPrompt && chatAttachments.length === 0) return; const retryPrompt = `${lastPrompt} \n\n[SISTEMA]: "DO ZERO" (WIPE). O usuário não gostou da versão anterior. \n1. IGNORE e SOBRESCREVA qualquer código existente (use action: 'create').\n2. Tente uma abordagem completamente diferente e melhorada.\n3. Foco em VISUAL e FÍSICA.`; processAiRequest(retryPrompt, "🔄 Tentando novamente do zero (Wipe & Redo)...", true, chatAttachments); };
  const handleFixError = () => { if (runtimeError) { const prompt = `CORREÇÃO DE ERRO no arquivo '${activeFilename}': O preview falhou com "${runtimeError.message}" na linha ${runtimeError.line || '?'}. Identifique a causa e corrija.`; processAiRequest(prompt, `Corrigir erro: ${runtimeError.message}`, true); } };
  const handleDeepDebug = () => { processAiRequest("ANÁLISE PROFUNDA: Verifique todos os arquivos por erros de lógica ou referências quebradas.", "🔍 Iniciando Deep Debug...", true); };
  const handleClearChat = () => { setMessages([{ id: Date.now().toString(), role: 'assistant', content: 'Chat limpo. Como posso ajudar agora?' }]); setShowTools(false); };
  
  const submitCreativeTheme = () => {
      setShowCreativeModal(false);
      const styleName = CREATIVE_PRESETS.find(p => p.id === creativeStyle)?.label || 'Personalizado/Livre';
      const prompt = `ATUAR COMO CRIADOR DE JOGOS FULL-STACK (GAME DESIGNER + ENGENHEIRO).
      OBJETIVO: Criar uma solução completa (Visual + Lógica) para o pedido do usuário.
      PEDIDO DO USUÁRIO: "${creativeInstruction}"
      ${creativeStyle ? `REFERÊNCIA VISUAL: ${styleName}` : ''}
      REGRAS CRÍTICAS:
      1. NÃO SE LIMITE AO CSS. Se o usuário pedir uma mecânica, DEVE escrever o JavaScript.
      2. Crie novos arquivos se necessário.
      3. Seja ousado na implementação.
      4. Explique seu plano no 'thoughtProcess'.
      `;
      processAiRequest(prompt, `🚀 Planejando Mecânicas & Visual: ${creativeInstruction.substring(0, 30)}...`, true, [], undefined, true);
  };

  const applyPendingCreative = async () => {
      if (!pendingCreativeUpdate) return;
      setPendingCreativeUpdate(null);
      // setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: pendingCreativeUpdate.thoughtProcess }]);
      await applyPatchesSequentially(pendingCreativeUpdate.patches);
      setMessages(prev => [...prev, { id: (Date.now() + 2).toString(), role: 'assistant', content: '✅ Alterações aplicadas com sucesso.' }]);
  };
  
  const handleChatAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    if (e.target.files) { 
        const rawFiles: File[] = Array.from(e.target.files); 
        if (chatAttachments.length + rawFiles.length > 3) return alert("Máximo 3 arquivos.");
        const processedFiles: File[] = [];
        
        for (const file of rawFiles) {
            // Proteção contra arquivos gigantes (5MB) para evitar crash de memória/render
            if (file.size > 5 * 1024 * 1024) {
                alert(`O arquivo "${file.name}" é muito grande (Máx 5MB). Ele será ignorado.`);
                continue;
            }

            if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
                try {
                    const convertedBlob = await convertToSupportedImage(file);
                    const newFile = new File([convertedBlob], file.name.replace(/\.(gif|svg)$/i, '.png'), { type: 'image/png' });
                    processedFiles.push(newFile);
                } catch (e) { 
                    console.error("Erro na conversão de imagem", e);
                    processedFiles.push(file); 
                }
            } else { processedFiles.push(file); }
        }
        setChatAttachments(prev => [...prev, ...processedFiles]); 
    } 
    if (fileInputRef.current) fileInputRef.current.value = ''; 
    if (imageInputRef.current) imageInputRef.current.value = ''; 
  };
  
  const filteredFiles = Object.keys(files).filter(f => f.toLowerCase().includes(fileSearch.toLowerCase())).sort();

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-zinc-100 font-sans overflow-hidden">
      <header className="flex-none flex items-center justify-between px-3 py-2 border-b border-zinc-900 bg-black z-30 h-14">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-colors ${isGameMode ? 'bg-indigo-900/50 shadow-indigo-500/20' : 'bg-emerald-900/50 shadow-emerald-500/20'}`}>
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-white leading-none hidden sm:inline">
                    {isGameMode ? 'DevGame' : 'DevWeb'}
                </span>
            </div>
          </div>
          <div className="h-6 w-px bg-zinc-900 mx-1 hidden sm:block"></div>
          <button onClick={() => setIsGameMode(!isGameMode)} className={`flex items-center justify-center w-8 h-8 rounded-md border transition-all ${isGameMode ? 'bg-indigo-900/10 border-indigo-900 text-indigo-400 hover:bg-indigo-900/30' : 'bg-emerald-900/10 border-emerald-900 text-emerald-400 hover:bg-emerald-900/30'}`} title={isGameMode ? "Modo Criação de Jogos (Sem Scroll)" : "Modo Web Dev (Com Scroll)"} > 
             {isGameMode ? <Gamepad2 className="w-4 h-4" /> : <Globe className="w-4 h-4" />} 
          </button>
          <div className="flex bg-zinc-900 rounded-md border border-zinc-800 p-0.5 ml-2">
            <button onClick={() => setPlatformTarget('mobile')} className={`p-1.5 rounded transition-colors ${platformTarget === 'mobile' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Mobile Only (Touch)"><Smartphone className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPlatformTarget('pc')} className={`p-1.5 rounded transition-colors ${platformTarget === 'pc' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="PC Only (Mouse/Keyboard)"><Monitor className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPlatformTarget('both')} className={`p-1.5 rounded transition-colors ${platformTarget === 'both' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`} title="Cross-Platform (Responsivo)"><Laptop className="w-3.5 h-3.5" /></button>
          </div>
          <div className="relative ml-2">
              <button onClick={() => setShowTools(!showTools)} className={`flex items-center justify-center w-8 h-8 rounded-md border transition-all ${showTools ? 'bg-zinc-900 border-indigo-500 text-indigo-400' : 'bg-black border-zinc-800 text-zinc-400 hover:bg-zinc-900'}`} title="Ferramentas"> 
                 <Wrench className="w-4 h-4" /> 
              </button>
              {showTools && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-black border border-zinc-800 rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-100">
                      <button onClick={() => { setShowCreativeModal(true); setShowTools(false); }} className="flex items-center gap-3 px-3 py-2.5 text-xs text-left hover:bg-zinc-900 rounded-md text-pink-300"><Rocket className="w-4 h-4 text-pink-500" /> <div><div className="font-bold">Creative Update</div><div className="text-[9px] text-zinc-500">Mecânicas & Visual</div></div></button>
                      <button onClick={handleDeepDebug} className="flex items-center gap-3 px-3 py-2.5 text-xs text-left hover:bg-zinc-900 rounded-md text-red-300"><Bug className="w-4 h-4 text-red-500" /> <div><div className="font-bold">Deep Debug</div><div className="text-[9px] text-zinc-500">Corrigir Lógica</div></div></button>
                      <div className="h-px bg-zinc-900 my-1"></div>
                      <button onClick={handleClearChat} className="flex items-center gap-3 px-3 py-2 text-xs text-left hover:bg-zinc-900 rounded-md text-zinc-500"><Trash2 className="w-3.5 h-3.5" /> Limpar Chat</button>
                  </div>
              )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex items-center bg-black rounded-md border border-zinc-800 shadow-sm overflow-hidden mr-1">
                <button onClick={handleUndo} disabled={historyIndex === 0 || agentStatus.isActive} className="p-2 hover:bg-zinc-900 text-zinc-400 disabled:opacity-30 border-r border-zinc-800"><Undo2 className="w-4 h-4" /></button>
                <button onClick={handleRedo} disabled={historyIndex === history.length - 1 || agentStatus.isActive} className="p-2 hover:bg-zinc-900 text-zinc-400 disabled:opacity-30"><Redo2 className="w-4 h-4" /></button>
            </div>
            <button onClick={() => setIsThinkingMode(!isThinkingMode)} className={`p-2 rounded-md border transition-all ${isThinkingMode ? 'bg-purple-900/20 border-purple-500/50 text-purple-300' : 'bg-transparent border-transparent text-zinc-600 hover:text-zinc-400'}`} title={isThinkingMode ? "Pensamento Ativo" : "Modo Rápido"}> <BrainCircuit className="w-4 h-4" /> </button>
            <div className="relative">
                <button onClick={() => setShowMainMenu(!showMainMenu)} className={`p-2 rounded-md border transition-all ${showMainMenu ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}>
                    <MoreVertical className="w-4 h-4" />
                </button>
                {showMainMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-3 py-2 text-[10px] text-zinc-500 border-b border-zinc-800 mb-1 flex justify-between items-center bg-black/20">
                            <span>v4.0.3</span>
                            <span className={`font-bold ${llmProvider === 'openrouter' ? 'text-purple-500' : 'text-indigo-500'}`}>
                                {llmProvider === 'openrouter' ? 'OpenRouter' : 'Gemini'}
                            </span>
                        </div>
                        <button onClick={() => { setShowSettingsModal(true); setShowMainMenu(false); }} className="flex items-center gap-3 px-3 py-2.5 text-xs text-left hover:bg-zinc-800 rounded-md text-zinc-300">
                            <Settings className="w-4 h-4 text-zinc-500" /> Configurações & API
                        </button>
                        <div className="h-px bg-zinc-800 my-1"></div>
                        <button onClick={() => { setShowDownloadModal(true); setShowMainMenu(false); }} className="flex items-center gap-3 px-3 py-2.5 text-xs text-left hover:bg-zinc-800 rounded-md text-zinc-300">
                            <Download className="w-4 h-4 text-emerald-500" /> Baixar Projeto (ZIP)
                        </button>
                        <label className="flex items-center gap-3 px-3 py-2.5 text-xs text-left hover:bg-zinc-800 rounded-md text-zinc-300 cursor-pointer">
                            <Upload className="w-4 h-4 text-blue-500" /> Importar Arquivo
                            <input type="file" accept=".html,.htm,.css,.js,.zip" className="hidden" onChange={(e) => { handleProjectFileUpload(e); setShowMainMenu(false); }} />
                        </label>
                    </div>
                )}
            </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
           {showUpdateModal && (<div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300"><div className="bg-zinc-900 border border-indigo-500/30 shadow-2xl shadow-indigo-500/20 rounded-2xl max-w-lg w-full overflow-hidden"><div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 p-6 border-b border-zinc-800"><div className="flex items-center gap-3"><PanelLeft className="w-6 h-6 text-indigo-400" /><h2 className="text-xl font-bold text-white">Hotfix v4.0.3</h2></div></div><div className="p-6 space-y-4"><ul className="space-y-3"><li className="flex gap-3 items-start"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /><div className="text-sm text-zinc-300"><strong className="text-white block">Melhoria no Patcher</strong>Adicionado "Anchor Matching" para corrigir falhas de update.</div></li></ul><button onClick={closeUpdateModal} className="w-full py-3 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all">Entendido</button></div></div></div>)}
           {showSettingsModal && (
               <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                   <div className="bg-black border border-zinc-800 shadow-2xl rounded-2xl max-w-md w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
                       <div className="flex items-center gap-3 border-b border-zinc-900 pb-4"><Settings className="w-6 h-6 text-indigo-400" /><h3 className="text-xl font-bold text-white">Configurações</h3></div>
                       <div className="space-y-4">
                           <div className="space-y-2"><label className="text-xs font-bold text-zinc-400 flex items-center gap-2"><Server className="w-3.5 h-3.5" /> Provedor de LLM</label><div className="grid grid-cols-2 gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800"><button onClick={() => setLlmProvider('google')} className={`text-xs py-2 rounded-md font-bold transition-colors ${llmProvider === 'google' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>Google Gemini</button><button onClick={() => setLlmProvider('openrouter')} className={`text-xs py-2 rounded-md font-bold transition-colors ${llmProvider === 'openrouter' ? 'bg-purple-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>OpenRouter / OpenAI</button></div></div>
                           <div className="space-y-2"><label className="text-xs font-bold text-zinc-400 flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> {llmProvider === 'google' ? 'Google Gemini API Key' : 'OpenRouter / OpenAI Key'}</label><div className="relative"><input type={showApiKey ? "text" : "password"} value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)} placeholder={llmProvider === 'google' ? "AIzaSy..." : "sk-or-v1..."} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-4 pr-10 py-3 text-sm focus:border-indigo-500 focus:outline-none text-zinc-200" /><button onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">{showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
                           <div className="space-y-2"><label className="text-xs font-bold text-zinc-400 flex items-center gap-2 justify-between"><div className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> Modelo (Model ID)</div>{llmProvider === 'openrouter' && (<button onClick={() => setShowModelGallery(true)} className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"><BookOpen className="w-3 h-3" /> Galeria Grátis</button>)}</label><input type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} list="openrouter-models" placeholder={llmProvider === 'google' ? "gemini-1.5-pro-latest (Opcional)" : "nex-agi/deepseek-v3.1-nex-n1:free"} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none text-zinc-200 font-mono" />{llmProvider === 'openrouter' && (<datalist id="openrouter-models">{FREE_OPENROUTER_MODELS.map(m => (<option key={m.id} value={m.id}>{m.name} - {m.tags.join(', ')}</option>))}</datalist>)}</div>
                           <div className="space-y-2"><label className="text-xs font-bold text-zinc-400 flex items-center gap-2"><FileEdit className="w-3.5 h-3.5" /> Instruções Personalizadas (System Prompt)</label><textarea value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} placeholder="Ex: Sempre use Tailwind CSS. Seja sarcástico. Priorize performance. Não use comentários." className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none text-zinc-200 min-h-[80px]" /></div>
                           <div className="pt-2"><button onClick={handleTestConnection} disabled={connectionStatus === 'testing' || !customApiKey} className={`w-full py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all ${connectionStatus === 'success' ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400' : connectionStatus === 'error' ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'}`}>{connectionStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : connectionStatus === 'success' ? <Wifi className="w-4 h-4" /> : connectionStatus === 'error' ? <WifiOff className="w-4 h-4" /> : <Server className="w-4 h-4" />}{connectionStatus === 'testing' ? 'Testando Conexão...' : connectionStatus === 'success' ? 'Conexão Bem Sucedida!' : connectionStatus === 'error' ? 'Erro na Conexão' : 'Testar Conexão'}</button>{connectionMessage && (<div className={`mt-2 text-[10px] px-2 py-1 rounded border ${connectionStatus === 'success' ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-300' : connectionStatus === 'error' ? 'bg-red-950/30 border-red-900/50 text-red-300' : 'text-zinc-500'}`}>{connectionMessage}</div>)}</div>
                       </div>
                       <div className="flex gap-3 pt-2"><button onClick={() => setShowSettingsModal(false)} className="flex-1 py-2 rounded-lg border border-zinc-800 text-zinc-400 text-xs hover:bg-zinc-900">Cancelar</button>{(customApiKey || customModel || customInstructions) && <button onClick={clearSettings} className="px-4 py-2 rounded-lg border border-red-900/30 text-red-500 text-xs hover:bg-red-900/10">Resetar</button>}<button onClick={saveSettings} className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20">Salvar Alterações</button></div>
                   </div>
               </div>
           )}
           {showModelGallery && ( <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in"> <div className="bg-zinc-900 border border-zinc-700 shadow-2xl rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"> <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950"> <div className="flex items-center gap-3 text-purple-400 font-bold"><BookOpen className="w-5 h-5" /> Galeria de Modelos Gratuitos (OpenRouter)</div> <button onClick={() => setShowModelGallery(false)} className="p-2 hover:bg-zinc-800 rounded-full"><X className="w-5 h-5" /></button> </div> <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black"> {FREE_OPENROUTER_MODELS.map((m) => ( <div key={m.id} onClick={() => { setCustomModel(m.id); setShowModelGallery(false); }} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-purple-500/50 hover:bg-zinc-800 transition-all cursor-pointer group"> <div className="flex justify-between items-start mb-2"> <h4 className="font-bold text-zinc-100 group-hover:text-purple-300 transition-colors">{m.name}</h4> <div className="flex gap-1"> {m.tags.map(tag => ( <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{tag}</span> ))} </div> </div> <p className="text-sm text-zinc-500 mb-3">{m.desc}</p> <code className="text-[10px] text-zinc-600 bg-zinc-950 px-2 py-1 rounded block truncate font-mono">{m.id}</code> </div> ))} </div> <div className="p-3 bg-zinc-900 border-t border-zinc-800 text-center text-xs text-zinc-500"> Clique em um modelo para selecioná-lo automaticamente nas configurações. </div> </div> </div> )}
           {showDownloadModal && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-zinc-900 border border-zinc-700 shadow-2xl rounded-2xl max-w-sm w-full p-6 space-y-4">
                  <div className="flex items-center gap-3">
                     <Download className="w-5 h-5 text-emerald-500" />
                     <h3 className="text-lg font-bold text-white">Baixar Projeto</h3>
                  </div>
                  <p className="text-xs text-zinc-400">
                     Salve seu projeto localmente. Se houver múltiplos arquivos, será gerado um ZIP.
                  </p>
                  <div>
                     <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Nome do Arquivo</label>
                     <input 
                       type="text" 
                       className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:border-emerald-500/50 focus:outline-none text-zinc-200" 
                       placeholder="meu-projeto" 
                       value={downloadName} 
                       onChange={(e) => setDownloadName(e.target.value)} 
                       autoFocus
                     />
                  </div>
                  <div className="flex gap-3 pt-2">
                     <button onClick={() => setShowDownloadModal(false)} className="flex-1 py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:bg-zinc-800">Cancelar</button>
                     <button onClick={handleDownload} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20">
                       Baixar Agora
                     </button>
                  </div>
                </div>
              </div>
           )}

           {pendingCreativeUpdate && (
               <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in zoom-in-95">
                   <div className="bg-zinc-950 border border-zinc-800 shadow-[0_0_50px_rgba(236,72,153,0.15)] rounded-2xl max-w-3xl w-full flex flex-col max-h-[85vh] overflow-hidden relative">
                       <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500"></div>
                       <div className="p-6 border-b border-zinc-900 flex justify-between items-start bg-zinc-950">
                           <div className="flex items-start gap-4">
                               <div className="p-3 bg-pink-500/10 rounded-xl border border-pink-500/20 shadow-inner">
                                   <PenTool className="w-6 h-6 text-pink-500" />
                               </div>
                               <div>
                                   <h3 className="text-xl font-bold text-white tracking-tight">Design Blueprint</h3>
                                   <p className="text-sm text-zinc-400 mt-1 flex items-center gap-2">
                                       <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                       Plano gerado pela IA para aprovação
                                   </p>
                               </div>
                           </div>
                           <button onClick={() => setPendingCreativeUpdate(null)} className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
                       </div>
                       <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[radial-gradient(#222_1px,transparent_1px)] [background-size:20px_20px] bg-zinc-950">
                           <div className="relative">
                               <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-transparent rounded-full opacity-30"></div>
                               <h4 className="text-sm font-bold text-indigo-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                   <Lightbulb className="w-4 h-4" /> Estratégia
                               </h4>
                               <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6 shadow-xl">
                                   <p className="text-base text-zinc-200 leading-relaxed font-light whitespace-pre-wrap">
                                       {pendingCreativeUpdate.thoughtProcess.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
                                   </p>
                               </div>
                           </div>
                           <div>
                               <h4 className="text-sm font-bold text-emerald-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                                   <FileCode className="w-4 h-4" /> Arquivos Modificados ({pendingCreativeUpdate.patches.length})
                               </h4>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {pendingCreativeUpdate.patches.map((patch, idx) => {
                                       // SAFEGUARD: Ensure action and targetFile exist
                                       const action = patch.action || 'update';
                                       const target = patch.targetFile || 'unknown';
                                       
                                       return (
                                       <div key={idx} className="group flex flex-col p-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all hover:shadow-lg hover:-translate-y-0.5">
                                           <div className="flex justify-between items-start mb-3">
                                               <div className="flex items-center gap-2">
                                                   {target.endsWith('.html') ? <Layout className="w-4 h-4 text-orange-400" /> : 
                                                    target.endsWith('.css') ? <FileText className="w-4 h-4 text-blue-400" /> :
                                                    target.endsWith('.js') ? <Code className="w-4 h-4 text-yellow-400" /> :
                                                    <FileIcon className="w-4 h-4 text-zinc-500" />}
                                                   <span className="font-bold text-sm text-zinc-200">{target}</span>
                                               </div>
                                               <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                                   action === 'create' ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400' : 
                                                   action === 'delete' ? 'bg-red-950/50 border-red-500/30 text-red-400' : 
                                                   'bg-blue-950/50 border-blue-500/30 text-blue-400'
                                               }`}>
                                                   {action.toUpperCase()}
                                               </span>
                                           </div>
                                           <p className="text-xs text-zinc-500 leading-snug group-hover:text-zinc-400 transition-colors">
                                               {patch.description || 'Sem descrição'}
                                           </p>
                                       </div>
                                   )})}
                               </div>
                           </div>
                       </div>
                       <div className="p-6 border-t border-zinc-900 bg-zinc-950 flex justify-end gap-3 z-10">
                           <button onClick={() => setPendingCreativeUpdate(null)} className="px-6 py-3 rounded-xl text-xs font-bold text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors">
                               Cancelar / Ajustar
                           </button>
                           <button 
                               onClick={applyPendingCreative}
                               className="px-8 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-pink-500/20 flex items-center gap-2 transition-all hover:scale-105 group"
                           >
                               <span>Aprovar Alterações</span>
                               <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                           </button>
                       </div>
                   </div>
               </div>
           )}
           
           {showCreativeModal && (
               <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in">
                   <div className="bg-zinc-900 border border-pink-500/30 shadow-2xl rounded-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
                       <div className="p-5 border-b border-zinc-800 bg-zinc-950/50 flex justify-between items-center">
                           <div className="flex items-center gap-3">
                               <Rocket className="w-6 h-6 text-pink-500" />
                               <div>
                                   <h3 className="text-lg font-bold text-white">Creative Update & Mechanics</h3>
                                   <p className="text-xs text-zinc-400">Descreva qualquer ideia. Visual, mecânicas, ou ambos.</p>
                               </div>
                           </div>
                           <button onClick={() => setShowCreativeModal(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5"/></button>
                       </div>
                       
                       <div className="p-5 overflow-y-auto space-y-6 flex-1">
                           <div>
                               <label className="text-sm font-bold text-white mb-2 block flex items-center gap-2">
                                   <Sparkles className="w-4 h-4 text-pink-400" />
                                   O que você quer criar ou mudar?
                               </label>
                               <textarea 
                                   className="w-full bg-black border border-zinc-700 rounded-xl p-4 text-sm text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500/50 focus:outline-none min-h-[120px] placeholder:text-zinc-600"
                                   placeholder="Ex: 'Faça o personagem dar pulo duplo', 'Adicione inimigos que perseguem', 'Mude tudo para tema Cyberpunk', 'Crie um sistema de pontuação'..."
                                   value={creativeInstruction}
                                   onChange={(e) => setCreativeInstruction(e.target.value)}
                                   autoFocus
                               />
                               <p className="text-[10px] text-zinc-500 mt-2">
                                   * A IA vai gerar um plano para você aprovar antes de alterar o código.
                               </p>
                           </div>

                           <div className="border-t border-zinc-800 pt-4">
                               <label className="text-xs font-bold text-zinc-400 mb-3 block flex items-center justify-between">
                                   <span>Inspiração Visual Rápida (Opcional)</span>
                                   {creativeStyle && <button onClick={() => setCreativeStyle('')} className="text-[10px] text-red-400 hover:text-red-300">Remover Filtro</button>}
                               </label>
                               <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                   {CREATIVE_PRESETS.map(preset => (
                                       <button
                                           key={preset.id}
                                           onClick={() => setCreativeStyle(preset.id === creativeStyle ? '' : preset.id)}
                                           className={`relative p-2.5 rounded-lg border text-left transition-all group overflow-hidden flex flex-col gap-1 ${creativeStyle === preset.id ? 'border-pink-500 bg-pink-900/20' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                                       >
                                           <div className={`absolute inset-0 bg-gradient-to-br ${preset.colors} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                                           <div className="flex justify-between items-start">
                                                <span className={`font-bold text-xs ${creativeStyle === preset.id ? 'text-white' : 'text-zinc-300'}`}>{preset.label}</span>
                                                {creativeStyle === preset.id && <CheckCircle2 className="w-3.5 h-3.5 text-pink-500" />}
                                           </div>
                                           <span className="text-[9px] text-zinc-500 leading-tight">{preset.desc}</span>
                                       </button>
                                   ))}
                               </div>
                           </div>
                       </div>
                       
                       <div className="p-5 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
                           <button onClick={() => setShowCreativeModal(false)} className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-400 hover:text-white transition-colors">Cancelar</button>
                           <button 
                               onClick={submitCreativeTheme}
                               disabled={!creativeInstruction.trim() && !creativeStyle}
                               className="px-6 py-2 rounded-lg bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-pink-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all hover:scale-105"
                           >
                               <Rocket className="w-4 h-4" /> 
                               {creativeInstruction.trim() ? 'Planejar & Executar' : 'Aplicar Estilo'}
                           </button>
                       </div>
                   </div>
               </div>
           )}

            <div className={`${activeTab === AppTab.EDITOR ? 'flex w-full flex-1' : 'hidden md:flex md:w-1/2'} relative bg-black flex-row`}>
                {isSidebarOpen && (
                    <div className="flex-none w-64 bg-black border-r border-zinc-900 flex flex-col absolute md:static inset-y-0 left-0 z-40 shadow-xl md:shadow-none animate-in slide-in-from-left duration-200">
                        <div className="p-3 border-b border-zinc-900 flex items-center gap-2">
                            <Search className="w-4 h-4 text-zinc-500" />
                            <input 
                                type="text" 
                                placeholder="Buscar arquivos..." 
                                className="bg-transparent border-none text-xs text-zinc-300 focus:outline-none w-full"
                                value={fileSearch}
                                onChange={(e) => setFileSearch(e.target.value)}
                            />
                            <button onClick={handleCreateFile} className="p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white" title="Criar Arquivo"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                            {filteredFiles.map(filename => (
                                <button
                                    key={filename}
                                    onClick={() => { setActiveFilename(filename); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs truncate transition-colors ${activeFilename === filename ? 'bg-zinc-900 text-white border border-zinc-800' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}`}
                                    title={filename}
                                >
                                    {filename.endsWith('.html') ? <Layout className="w-3.5 h-3.5 shrink-0 text-orange-400" /> : 
                                     filename.endsWith('.css') ? <FileText className="w-3.5 h-3.5 shrink-0 text-blue-400" /> : 
                                     filename.endsWith('.js') ? <Code className="w-3.5 h-3.5 shrink-0 text-yellow-400" /> : 
                                     <FileIcon className="w-3.5 h-3.5 shrink-0 text-zinc-600" />}
                                    <span className="truncate">
                                        {filename.includes('/') ? (
                                            <span className="opacity-50">{filename.substring(0, filename.lastIndexOf('/') + 1)}</span>
                                        ) : null}
                                        {filename.split('/').pop()}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="p-2 border-t border-zinc-900 text-[10px] text-zinc-700 text-center">
                            {Object.keys(files).length} arquivos
                        </div>
                    </div>
                )}
                
                <div className="flex-1 flex flex-col min-w-0 bg-black relative">
                    <div className="flex-none h-9 bg-black flex items-center px-2 border-b border-zinc-900 gap-3">
                         <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-1.5 rounded-md hover:bg-zinc-900 transition-colors ${isSidebarOpen ? 'text-indigo-400' : 'text-zinc-600'}`} title="Toggle Sidebar">
                            <PanelLeft className="w-4 h-4" />
                         </button>
                         <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium font-mono">
                            {agentStatus.isActive ? <BrainCircuit className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> : 
                             activeFilename.endsWith('.html') ? <Layout className="w-3.5 h-3.5 text-orange-400" /> : 
                             activeFilename.endsWith('.css') ? <FileText className="w-3.5 h-3.5 text-blue-400" /> : 
                             <Code className="w-3.5 h-3.5 text-yellow-400" />}
                            <span className="truncate max-w-[200px]">{agentStatus.isActive ? 'IA GENERATIVA (LIVE)' : activeFilename}</span>
                         </div>
                         
                         <div className="ml-auto flex items-center gap-3">
                            <div className="relative">
                                <button 
                                    onClick={() => setShowThemePanel(!showThemePanel)}
                                    className={`p-1.5 rounded-md hover:bg-zinc-800 transition-colors ${showThemePanel ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                                    title="Personalizar Tema"
                                >
                                    <Palette className="w-4 h-4" />
                                </button>
                                
                                {showThemePanel && (
                                    <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col p-3 animate-in fade-in zoom-in-95 duration-100">
                                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                                            <span className="text-xs font-bold text-white flex items-center gap-2"><Palette className="w-3 h-3 text-pink-500" /> Aparência</span>
                                            <button onClick={() => setShowThemePanel(false)}><X className="w-3 h-3 text-zinc-500 hover:text-white" /></button>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-zinc-500 mb-1 block">Preset</label>
                                                <select 
                                                   value={editorTheme}
                                                   onChange={(e) => setEditorTheme(e.target.value)}
                                                   className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs focus:outline-none text-zinc-300"
                                                >
                                                   <option value="devgame-neon">DevGame Neon</option>
                                                   <option value="dracula">Dracula</option>
                                                   <option value="monokai">Monokai</option>
                                                   <option value="midnight">Midnight OLED</option>
                                                   <option value="github-dark">GitHub Dark</option>
                                                   <option value="custom">Custom (Personalizado)</option>
                                                </select>
                                            </div>

                                            {editorTheme === 'custom' && (
                                                <div className="space-y-2 animate-in slide-in-from-top-2">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[9px] text-zinc-500 block mb-1">Fundo</label>
                                                            <div className="flex items-center gap-2 bg-zinc-950 rounded border border-zinc-800 p-1">
                                                                <input type="color" value={customThemeColors.background} onChange={(e) => setCustomThemeColors({...customThemeColors, background: e.target.value})} className="w-4 h-4 rounded bg-transparent border-none cursor-pointer" />
                                                                <span className="text-[9px] font-mono text-zinc-400">{customThemeColors.background}</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] text-zinc-500 block mb-1">Texto</label>
                                                            <div className="flex items-center gap-2 bg-zinc-950 rounded border border-zinc-800 p-1">
                                                                <input type="color" value={customThemeColors.foreground} onChange={(e) => setCustomThemeColors({...customThemeColors, foreground: e.target.value})} className="w-4 h-4 rounded bg-transparent border-none cursor-pointer" />
                                                                <span className="text-[9px] font-mono text-zinc-400">{customThemeColors.foreground}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {agentStatus.isActive && <div className="px-3 text-[10px] text-indigo-400 animate-pulse font-bold flex items-center gap-2 font-mono"><Loader2 className="w-3 h-3 animate-spin" /> PROCESSANDO...</div>}
                         </div>
                    </div>
                    
                    <div className="flex-1 relative">
                        <CodeEditor 
                            key={agentStatus.isActive ? 'ai-stream' : activeFilename} 
                            code={agentStatus.isActive ? streamedResponse : (files[activeFilename] || '')} 
                            language={agentStatus.isActive ? 'json' : (activeFilename.endsWith('.js') ? 'javascript' : activeFilename.endsWith('.css') ? 'css' : 'html')}
                            theme={editorTheme}
                            customTheme={customThemeColors}
                            onChange={(val) => {
                                if (val !== undefined && !agentStatus.isActive) {
                                    setFiles(prev => ({ ...prev, [activeFilename]: val }));
                                }
                            }} 
                            readOnly={agentStatus.isActive} 
                            highlightSnippet={highlightSnippet} 
                            errorLine={runtimeError?.line} 
                        />
                    </div>
                </div>
            </div>

            <div className={`${activeTab !== AppTab.EDITOR ? 'flex w-full flex-1' : 'hidden md:flex md:w-1/2'} flex-col relative bg-zinc-900 overflow-hidden`}>
                <div className="hidden md:flex border-b border-zinc-900 bg-black h-9 flex-none">
                    <button onClick={() => setActiveTab(AppTab.PREVIEW)} className={`px-4 flex items-center gap-2 text-[11px] font-medium border-b-2 ${(activeTab === AppTab.PREVIEW || activeTab === AppTab.EDITOR) ? 'text-indigo-400 border-indigo-500 bg-zinc-900' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}><Play className="w-3.5 h-3.5" /> Preview</button>
                    <button onClick={() => setActiveTab(AppTab.CHAT)} className={`px-4 flex items-center gap-2 text-[11px] font-medium border-b-2 ${activeTab === AppTab.CHAT ? 'text-indigo-400 border-indigo-500 bg-zinc-900' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}><MessageSquare className="w-3.5 h-3.5" /> Chat</button>
                </div>
                
                <div className="flex-1 relative overflow-hidden flex flex-col">
                    <div className={`absolute inset-0 flex flex-col ${ (activeTab === AppTab.PREVIEW || activeTab === AppTab.EDITOR) ? 'z-10 visible' : 'z-0 invisible' }`}>
                         {!activeFilename.endsWith('.html') && !activeFilename.includes('index') && (
                            <div className="bg-yellow-900/20 text-yellow-500 text-[10px] p-1 text-center border-b border-yellow-500/10">
                                Visualizando arquivo auxiliar. Preview pode não refletir mudanças.
                            </div>
                        )}
                        <Preview files={files} activeFilename={activeFilename} refreshKey={refreshKey} isGameMode={isGameMode} />
                        {runtimeError && (<div className="absolute inset-x-4 bottom-4 z-50 bg-zinc-950/95 border border-red-500/50 p-4 rounded-xl shadow-2xl flex flex-col gap-4 max-w-2xl mx-auto animate-in slide-in-from-bottom-5"><div className="flex justify-between items-start"><div className="flex gap-3"><AlertTriangle className="w-5 h-5 text-red-400" /><div><h3 className="text-sm font-bold text-red-100">Erro no Preview</h3><p className="text-xs text-red-200/80 font-mono break-all">{runtimeError.message}</p></div></div><button onClick={() => setRuntimeError(null)}><X className="w-4 h-4 text-zinc-500" /></button></div><button onClick={handleFixError} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"> <Bug className="w-3.5 h-3.5" /> Corrigir Automaticamente </button></div>)}
                    </div>
                    
                    <div className={`absolute inset-0 bg-black flex flex-col ${ (activeTab === AppTab.CHAT) ? 'z-10 visible' : 'z-0 invisible' }`}>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-900 text-white' : msg.role === 'system' ? 'bg-red-900/20 text-red-200 border border-red-900/40 w-full text-center' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'}`}>
                                      {msg.attachments && msg.attachments.length > 0 && (
                                          <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-thin">
                                              {msg.attachments.map((src, i) => (
                                                  <div key={i} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-white/20">
                                                      <img src={src} className="w-full h-full object-cover" alt="Attachment" />
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                      {msg.content}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                </div>
                
                <div className={`flex-none p-3 border-t border-zinc-900 bg-black ${ (activeTab === AppTab.CHAT) ? 'flex' : 'hidden md:flex' }`}>
                    <div className="w-full flex flex-col gap-2">
                        {chatAttachments.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 px-1">
                                {chatAttachments.map((file, idx) => (
                                    <div key={idx} className="relative group flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 pr-8 min-w-[120px] max-w-[200px]">
                                        <div className="bg-zinc-800 p-1 rounded"><FileImage className="w-3 h-3 text-zinc-300" /></div>
                                        <span className="text-[10px] truncate text-zinc-300">{file.name}</span>
                                        <button onClick={() => setChatAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-red-500/20 hover:text-red-400 rounded-full text-zinc-500 transition-colors"><X className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="relative flex items-center gap-2 w-full bg-zinc-900 p-1 rounded-xl border border-zinc-800 transition-all">
                            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,.txt,.js,.html,.css,.zip" onChange={handleChatAttachmentSelect} />
                            <input type="file" ref={imageInputRef} className="hidden" multiple accept="image/*" onChange={handleChatAttachmentSelect} />
                            <button onClick={() => imageInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-black rounded-lg transition-colors" title="Adicionar Imagem"><ImageIcon className="w-4 h-4" /></button>
                            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-black rounded-lg transition-colors" title="Adicionar Arquivo"><Paperclip className="w-4 h-4" /></button>
                            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder={isGameMode ? "Descreva seu jogo..." : "Descreva seu site ou app..."} className="flex-1 bg-transparent border-none text-zinc-100 text-xs rounded-lg pl-1 pr-2 py-2.5 focus:outline-none" disabled={agentStatus.isActive} />
                            
                            {lastPrompt && !agentStatus.isActive && (
                                <button onClick={handleRegenerate} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors" title="Refazer última alteração do zero (Wipe & Retry)">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            )}

                            <button onClick={handleSendMessage} disabled={(!input.trim() && chatAttachments.length === 0) || agentStatus.isActive} className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"><Send className="w-3.5 h-3.5" /></button>
                        </div>
                    </div>
                </div>
            </div>
            <AgentStatusOverlay status={agentStatus} streamContent={streamedResponse} />
      </main>
      <nav className="md:hidden flex-none border-t border-zinc-900 bg-black pb-[env(safe-area-inset-bottom,20px)] pt-2 z-30 grid grid-cols-3">
            <button onClick={() => setActiveTab(AppTab.EDITOR)} className={`flex flex-col items-center justify-center py-2.5 gap-1 ${activeTab === AppTab.EDITOR ? 'text-indigo-400' : 'text-zinc-600'}`}><Code className="w-5 h-5" /><span className="text-[9px] font-bold">CÓDIGO</span></button>
            <button onClick={() => setActiveTab(AppTab.PREVIEW)} className={`flex flex-col items-center justify-center py-2.5 gap-1 ${activeTab === AppTab.PREVIEW ? 'text-indigo-400' : 'text-zinc-600'}`}><MonitorPlay className="w-5 h-5" /><span className="text-[9px] font-bold">PREVIEW</span></button>
            <button onClick={() => setActiveTab(AppTab.CHAT)} className={`flex flex-col items-center justify-center py-2.5 gap-1 ${activeTab === AppTab.CHAT ? 'text-indigo-400' : 'text-zinc-600'}`}><MessageSquare className="w-5 h-5" /><span className="text-[9px] font-bold">CHAT</span></button>
      </nav>
    </div>
  );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
}