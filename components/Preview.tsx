import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Maximize, Minimize, ExternalLink, Smartphone, Monitor, Code2, FileCode, RefreshCw } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  // --- 1. CORE: UNIFIED BUNDLER ---
  const generatedBlobUrl = useMemo(() => {
    setError(null);
    try {
        // A. DETECTAR TIPO DE PROJETO (React vs Vanilla)
        const isReactApp = Object.keys(files).some(f => 
            f.match(/\.(t|j)sx$/) || 
            (f.endsWith('.js') && (files[f].includes('import React') || files[f].includes('from "react"')))
        );

        // --- MUDANÇA PRINCIPAL: LÓGICA DE DETECÇÃO DE ARQUIVO HTML ---
        // 1. Se o arquivo ativo for HTML, usa ele
        let htmlFilename = '';
        if (activeFilename && activeFilename.endsWith('.html') && files[activeFilename]) {
            htmlFilename = activeFilename;
        } else {
            // 2. Se não, tenta index.html
            if (files['index.html']) htmlFilename = 'index.html';
            // 3. Se não, pega o primeiro HTML que encontrar
            else htmlFilename = Object.keys(files).find(f => f.endsWith('.html')) || '';
        }

        let htmlContent = files[htmlFilename] || '';

        // Se não tiver HTML mas for React, cria um esqueleto
        if (!htmlContent && isReactApp) {
            htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>App</title><style>body{margin:0;background:#000;color:#fff;}</style></head><body><div id="root"></div></body></html>`;
        } else if (!htmlContent) {
             return URL.createObjectURL(new Blob([`<!DOCTYPE html><html><body style="background:#000;color:#666;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;"><h3>Nenhum arquivo .html encontrado.</h3></body></html>`], { type: 'text/html' }));
        }

        // =================================================================================
        // ESTRATÉGIA 1: INLINER AGRESSIVO (Para HTML/JS/Jogos Simples)
        // =================================================================================
        if (!isReactApp) {
            let processedHtml = htmlContent;

            // Helper para encontrar arquivos ignorando ./ ou /
            const getFileContent = (path: string) => {
                const cleanPath = path.split('?')[0].split('#')[0]; 
                if (files[cleanPath]) return files[cleanPath];
                if (cleanPath.startsWith('./') && files[cleanPath.slice(2)]) return files[cleanPath.slice(2)];
                if (cleanPath.startsWith('/') && files[cleanPath.slice(1)]) return files[cleanPath.slice(1)];
                const justName = cleanPath.split('/').pop();
                if (justName) {
                    const match = Object.keys(files).find(f => f.endsWith(justName));
                    if (match) return files[match];
                }
                return null;
            };

            // 1. Injetar CSS (<link rel="stylesheet"> -> <style>)
            processedHtml = processedHtml.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
                if (href.includes('stylesheet')) {
                    const css = getFileContent(href);
                    if (css) return `<style>/* ${href} */\n${css}</style>`;
                }
                return match;
            });

            // 2. Injetar JS (<script src="..."> -> <script>...</script>)
            processedHtml = processedHtml.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (match, src) => {
                if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) return match;
                const js = getFileContent(src);
                if (js) {
                    const openTag = match.replace(/src=["'][^"']+["']/, '').replace('><', '>');
                    const cleanOpenTag = openTag.split('>')[0] + '>'; 
                    return `${cleanOpenTag}\n// Injected: ${src}\n${js}\n</script>`;
                }
                return match;
            });

            // 3. Adicionar Error Handler Simples
            const errScript = `<script>window.onerror = function(e){ console.error("Preview Error:", e); };</script>`;
            if (processedHtml.includes('<head>')) {
                processedHtml = processedHtml.replace('<head>', `<head>${errScript}`);
            } else {
                processedHtml = errScript + processedHtml;
            }

            return URL.createObjectURL(new Blob([processedHtml], { type: 'text/html' }));
        }

        // =================================================================================
        // ESTRATÉGIA 2: VIRTUAL LOADER (Para React/TypeScript/Modules)
        // =================================================================================
        
        // Sanitiza o JSON para injetar no HTML sem quebrar a string
        const safeFiles = JSON.stringify(files).replace(/<\/script>/g, '<\\/script>');
        
        // Determina Entry Point
        let entryPoint = '';
        const possibleEntries = ['main.tsx', 'src/main.tsx', 'index.tsx', 'src/index.tsx', 'main.jsx', 'src/main.jsx', 'index.jsx', 'src/index.jsx'];
        
        // 1. Tenta achar no script src do HTML
        const scriptMatch = htmlContent.match(/<script[^>]+src=["']([^"']+)["'][^>]*>/);
        if (scriptMatch && scriptMatch[1]) {
            entryPoint = scriptMatch[1];
             if (entryPoint.startsWith('./')) entryPoint = entryPoint.slice(2);
        }
        
        // 2. Se não achou, tenta os padrões
        if (!entryPoint || !files[entryPoint]) {
             entryPoint = possibleEntries.find(e => files[e]) || '';
        }

        // 3. LIMPEZA CRÍTICA: Remover imports antigos que causam conflito e scripts de entrada
        let cleanHtml = htmlContent;
        
        // REMOVE IMPORTMAPS DO USUÁRIO QUE PODEM CONTER VERSÕES INVÁLIDAS (ex: carets ^)
        cleanHtml = cleanHtml.replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '');
        
        if (entryPoint) {
             const regex = new RegExp(`<script[^>]+src=["'].*?${entryPoint.replace('.', '\\.')}["'][^>]*><\\/script>`, 'i');
             cleanHtml = cleanHtml.replace(regex, '');
             cleanHtml = cleanHtml.replace(/<script type="module".*?<\/script>/gi, ''); // Limpa outros modules
        }

        const bootloader = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <script>
                window.process = { env: { NODE_ENV: 'development' } };
                window.onerror = (msg, url, line) => {
                    const div = document.createElement('div');
                    div.style = 'position:fixed;top:0;left:0;right:0;background:rgba(200,0,0,0.9);color:white;padding:10px;font-family:monospace;z-index:9999';
                    div.innerHTML = '<strong>Runtime Error:</strong> ' + msg + ' (Line ' + line + ')';
                    document.body.appendChild(div);
                };
            </script>
            <!-- Babel Standalone -->
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        </head>
        <body>
            ${cleanHtml.replace(/<!DOCTYPE html>|<html[^>]*>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<\/html>/gi, '')}
            
            <script>
                // 1. FILESYSTEM VIRTUAL
                const files = ${safeFiles};
                const entry = "${entryPoint}";

                // 2. HELPER DE RESOLUÇÃO
                function resolve(base, relative) {
                    const stack = base.split('/');
                    stack.pop();
                    const parts = relative.split('/');
                    for (let p of parts) {
                        if (p === '.') continue;
                        if (p === '..') stack.pop();
                        else stack.push(p);
                    }
                    let path = stack.join('/');
                    if (path.startsWith('/')) path = path.slice(1);
                    
                    if (files[path]) return path;
                    if (files[path + '.tsx']) return path + '.tsx';
                    if (files[path + '.ts']) return path + '.ts';
                    if (files[path + '.jsx']) return path + '.jsx';
                    if (files[path + '.js']) return path + '.js';
                    return path;
                }

                // 3. BOOTSTRAPPER
                async function boot() {
                    const registry = {}; 

                    // A. Injetar CSS
                    Object.keys(files).filter(f => f.endsWith('.css')).forEach(f => {
                        const style = document.createElement('style');
                        style.textContent = files[f];
                        document.head.appendChild(style);
                    });

                    // B. Transpilar
                    const modules = Object.keys(files).filter(f => f.match(/\.(t|j)sx?$/));
                    const transpiled = {};
                    
                    modules.forEach(f => {
                         try {
                            // Presets seguros para React 18
                            transpiled[f] = Babel.transform(files[f], {
                                filename: f,
                                presets: ['react', 'typescript', ['env', { modules: false }]]
                            }).code;
                         } catch (e) { 
                            console.error("Babel Error:", e);
                            transpiled[f] = files[f]; 
                         }
                    });

                    // C. Import Maps Controlado (Fixes "Unexpected token ^")
                    // Usamos versões exatas para garantir estabilidade no preview
                    const importMap = { imports: {} };
                    
                    importMap.imports["react"] = "https://esm.sh/react@18.2.0";
                    importMap.imports["react-dom/client"] = "https://esm.sh/react-dom@18.2.0/client";
                    importMap.imports["react-dom"] = "https://esm.sh/react-dom@18.2.0";
                    
                    // Mapeia locais
                    const blobUrls = {};
                    modules.forEach(f => {
                         let code = transpiled[f];
                         // Truque: Transformar imports relativos em absolutos "fake" para o importmap
                         code = code.replace(/from\s+['"]\.\/([^'"]+)['"]/g, 'from "/$1"');
                         code = code.replace(/from\s+['"]\.\.\/([^'"]+)['"]/g, 'from "/$1"');
                         
                         const b = new Blob([code], {type: 'text/javascript'});
                         blobUrls[f] = URL.createObjectURL(b);
                         
                         const key = '/' + f.replace(/\.(tsx|jsx|ts|js)$/, '');
                         importMap.imports[key] = blobUrls[f];
                         importMap.imports[key + '.js'] = blobUrls[f];
                         importMap.imports[key + '.tsx'] = blobUrls[f];
                    });

                    // Injeta Import Map Seguro
                    const mapEl = document.createElement('script');
                    mapEl.type = 'importmap';
                    mapEl.textContent = JSON.stringify(importMap);
                    document.head.appendChild(mapEl);

                    // Carrega Entry Point
                    if (entry) {
                         const entryName = '/' + entry.replace(/\.(tsx|jsx|ts|js)$/, '');
                         console.log("Booting React from:", entryName);
                         import(entryName).catch(e => {
                             console.error("Boot Error:", e);
                             document.body.innerHTML += '<div style="color:red;padding:20px">Erro ao iniciar aplicação React:<br>' + e.message + '</div>';
                         });
                    } else {
                        document.body.innerHTML += '<h3 style="color:red">Entry point (main.tsx) não encontrado.</h3>';
                    }
                }

                boot();
            </script>
        </body>
        </html>`;

        return URL.createObjectURL(new Blob([bootloader], { type: 'text/html' }));

    } catch (err: any) {
        setError(err.message);
        return '';
    }
  }, [files, activeFilename, refreshKey]);

  // Clean up blobs
  useEffect(() => {
    return () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (generatedBlobUrl) {
        setBlobUrl(generatedBlobUrl);
    }
  }, [generatedBlobUrl]);

  const openInNewTab = () => window.open(blobUrl, '_blank');
  const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen();
          setIsFullscreen(true);
      } else {
          document.exitFullscreen();
          setIsFullscreen(false);
      }
  };

  const isReact = Object.keys(files).some(f => f.match(/\.(t|j)sx$/));
  const displayHtmlFile = activeFilename.endsWith('.html') ? activeFilename : (Object.keys(files).find(f => f.endsWith('index.html')) || 'index.html');

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full bg-zinc-950 border-l border-zinc-900">
      <div className="flex-none h-10 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 gap-2 shadow-sm z-10">
        <div className="flex gap-1.5 mr-2 opacity-60 hover:opacity-100 transition-opacity">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
        </div>
        <div className="flex-1 bg-black/40 border border-zinc-800/50 rounded flex items-center px-3 py-1 text-xs text-zinc-400 font-mono truncate hover:bg-black/60 transition-colors">
            {isReact ? <Code2 className="w-3.5 h-3.5 text-cyan-500 mr-2" /> : <FileCode className="w-3.5 h-3.5 text-orange-500 mr-2" />}
            <span className="text-zinc-600 mr-1 select-none">preview://</span>
            <span className="text-zinc-300">{displayHtmlFile}</span>
        </div>
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isGameMode ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-400' : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'}`}>
            {isGameMode ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {isGameMode ? 'Game Mode' : 'Web Mode'}
        </div>
        <div className="w-px h-4 bg-zinc-800 mx-1"></div>
        <button onClick={openInNewTab} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors" title="Abrir em Nova Aba (Debug)">
            <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button onClick={toggleFullscreen} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors" title="Tela Cheia">
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex-1 relative w-full h-full bg-white/5 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]"> 
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
        {error && (
            <div className="absolute bottom-4 left-4 right-4 bg-red-900/90 text-white p-4 rounded-lg shadow-xl border border-red-500 text-xs font-mono whitespace-pre-wrap z-50">
                <strong>PREVIEW ERROR:</strong><br/>{error}
            </div>
        )}
      </div>
    </div>
  );
};