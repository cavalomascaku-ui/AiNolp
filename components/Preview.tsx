
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Maximize, Minimize, RefreshCw, ExternalLink, Smartphone, Monitor, AlertTriangle } from 'lucide-react';
import { ProjectFiles } from '../types';

interface PreviewProps {
  files: ProjectFiles;
  activeFilename: string;
  refreshKey: number;
  isGameMode: boolean;
}

export const Preview: React.FC<PreviewProps> = ({ files, activeFilename, refreshKey, isGameMode }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string>('');

  // --- 1. RESOLVER ARQUIVO DE ENTRADA ---
  const getEntryFile = () => {
     // Se o arquivo ativo for HTML, usa ele.
     if (activeFilename && activeFilename.endsWith('.html')) return activeFilename;
     // Se não, procura index.html
     if (files['index.html']) return 'index.html';
     // Se não, pega o primeiro HTML que achar
     return Object.keys(files).find(f => f.endsWith('.html')) || '';
  };

  // --- 2. BUNDLER (O SEGREDO DA TELA BRANCA) ---
  const bundledHtml = useMemo(() => {
    try {
        const entryFile = getEntryFile();
        if (!entryFile || !files[entryFile]) {
            return `<!DOCTYPE html><html><body style="background:#000;color:#666;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;">
                <div style="text-align:center;color:#666;">
                    <h3>Procurando entry point...</h3>
                    <p>Nenhum arquivo HTML principal encontrado.</p>
                </div>
            </body></html>`;
        }

        let html = files[entryFile];

        // INLINER DE CSS: Procura <link href="..."> e troca pelo conteúdo do arquivo CSS
        html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
            if (href.includes('://')) return match; // Ignora links externos (CDN)
            
            // Limpa query strings (?v=1) e ./
            const cleanPath = href.split('?')[0].replace(/^\.\//, '');
            
            // Tenta achar o arquivo no projeto
            const fileContent = files[cleanPath] || files['css/' + cleanPath] || files['styles/' + cleanPath];
            
            if (fileContent) {
                return `<style>/* Injected from ${cleanPath} */\n${fileContent}</style>`;
            }
            return match;
        });

        // INLINER DE JS: Procura <script src="..."> e troca pelo conteúdo do arquivo JS
        html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
            if (src.includes('://')) return match; // Ignora scripts externos (CDN)

            const cleanPath = src.split('?')[0].replace(/^\.\//, '');
            const fileContent = files[cleanPath] || files['js/' + cleanPath] || files['scripts/' + cleanPath];
            
            if (fileContent) {
                return `<script>/* Injected from ${cleanPath} */\n${fileContent}</script>`;
            }
            return match;
        });

        // FIX SCRIPT ERROR: Adiciona crossorigin="anonymous" em scripts externos para permitir pegar erros detalhados
        html = html.replace(/<script([^>]+)src=["'](https?:\/\/[^"']+)["']([^>]*)><\/script>/gi, (match, attrs1, src, attrs2) => {
            if (match.toLowerCase().includes('crossorigin')) return match;
            return `<script${attrs1}src="${src}" crossorigin="anonymous"${attrs2}></script>`;
        });

        // --- 3. INJEÇÃO DE SISTEMA (CSS de Layout & Error Handling) ---
        // Game Mode: Trava scroll e centraliza.
        // Web Mode: NÃO TOCA NO SCROLL. Deixa nativo.
        const systemCss = isGameMode 
            ? `html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000;display:flex;justify-content:center;align-items:center;color:#fff;} canvas{max-width:100%;max-height:100%;object-fit:contain;}`
            : `/* Web Mode: Reset mínimo para tirar margens brancas, mas mantendo scroll */ body{margin:0; min-height:100vh;} ::-webkit-scrollbar{width:8px;} ::-webkit-scrollbar-thumb{background:#555;border-radius:4px;} ::-webkit-scrollbar-track{background:#222;}`;

        const systemScript = `
            window.onerror = (m,s,l,c,e) => {
                // Filtra erros inúteis de Script error se não houver info
                if (m === 'Script error.' && !l) return;
                window.parent.postMessage({type:'PREVIEW_ERROR',payload:{message:m,line:l}},'*');
            };
            // Captura cliques em links internos
            document.addEventListener('click', (e) => {
                const a = e.target.closest('a');
                if(a){
                    const href = a.getAttribute('href');
                    if(href && !href.startsWith('http') && !href.startsWith('#')) {
                        e.preventDefault();
                        window.parent.postMessage({type:'LINK_CLICK',payload:href},'*');
                    }
                }
            });
        `;

        // Injeta no head ou no começo do arquivo
        const injection = `<style>${systemCss}</style><script>${systemScript}</script>`;
        if (html.includes('</head>')) {
            html = html.replace('</head>', injection + '</head>');
        } else {
            html = injection + html;
        }

        return html;
    } catch (e: any) {
        console.error("Preview Bundling Error:", e);
        return `<!DOCTYPE html><html><body style="background:#111;color:#f00;font-family:monospace;padding:20px;">
            <h3>Internal Preview Error</h3>
            <p>${e.message}</p>
        </body></html>`;
    }
  }, [files, activeFilename, isGameMode, refreshKey]);

  // --- 4. RENDERIZAÇÃO VIA BLOB URL (Estabilidade) ---
  useEffect(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl); // Limpa memória anterior

    const blob = new Blob([bundledHtml], { type: 'text/html' });
    const newUrl = URL.createObjectURL(blob);
    setBlobUrl(newUrl);

    return () => URL.revokeObjectURL(newUrl);
  }, [bundledHtml]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
    } else {
        document.exitFullscreen();
        setIsFullscreen(false);
    }
  };

  const openInNewTab = () => {
      window.open(blobUrl, '_blank');
  };

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full bg-zinc-950 border-l border-zinc-900">
      
      {/* Barra de Ferramentas / Endereço */}
      <div className="flex-none h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-2 shadow-sm z-10">
        <div className="flex gap-1.5 mr-2 opacity-60 hover:opacity-100 transition-opacity">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
        </div>

        {/* Indicador de Arquivo */}
        <div className="flex-1 bg-black/40 border border-zinc-800/50 rounded flex items-center px-3 py-1 text-xs text-zinc-400 font-mono truncate hover:bg-black/60 transition-colors">
            <span className="text-zinc-600 mr-2 select-none">preview://</span>
            <span className="text-zinc-300">{getEntryFile()}</span>
        </div>

        {/* Badge de Modo */}
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isGameMode ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-400' : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'}`}>
            {isGameMode ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {isGameMode ? 'Game Mode' : 'Web Mode'}
        </div>

        <div className="w-px h-4 bg-zinc-800 mx-1"></div>

        {/* Botões de Ação */}
        <button onClick={openInNewTab} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors" title="Abrir em Nova Aba (Debug)">
            <ExternalLink className="w-3.5 h-3.5" />
        </button>

        <button onClick={toggleFullscreen} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors" title="Tela Cheia">
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Área do Iframe */}
      <div className="flex-1 relative w-full h-full bg-white/5 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]"> 
        {/* Loader enquanto Blob carrega */}
        {!blobUrl && <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-xs">Carregando Preview...</div>}
        
        {blobUrl && (
            <iframe
                ref={iframeRef}
                src={blobUrl}
                title="Preview"
                className="absolute inset-0 w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups allow-downloads allow-pointer-lock"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; fullscreen; autoplay"
            />
        )}
      </div>

    </div>
  );
};
