import React, { useEffect, useRef } from 'react';
import { Loader2, BrainCircuit, Terminal, ChevronRight } from 'lucide-react';
import { AgentStatus } from '../types';

interface AgentStatusProps {
  status: AgentStatus;
  streamContent?: string;
}

export const AgentStatusOverlay: React.FC<AgentStatusProps> = ({ status, streamContent }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamContent]);

  if (!status.isActive) return null;

  // Limpeza visual simples para transformar o JSON cru em algo legível como "Log"
  const cleanLog = streamContent
    ? streamContent
        .replace(/```json/g, '')
        .replace(/^{/, '')
        .replace(/"thoughtProcess":\s*"/, '') // Remove a chave do JSON
        .replace(/",\s*"patches".*$/, '...') // Esconde o resto quando começa os patches
        .replace(/\\n/g, '\n') // Resolve quebras de linha escapadas
        .replace(/\\"/g, '"')
    : '';

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex flex-col justify-end pb-6 px-4 md:px-6">
      
      {/* TERMINAL DE PENSAMENTO (Aparece quando tem stream) */}
      {status.mode === 'thinking' && streamContent && (
          <div className="bg-black/90 backdrop-blur-xl border border-indigo-500/30 rounded-t-xl rounded-b-md shadow-2xl w-full max-w-2xl mx-auto mb-2 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-auto ring-1 ring-indigo-500/20">
              <div className="bg-zinc-900/50 border-b border-white/5 px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono text-indigo-300">
                      <BrainCircuit className="w-3.5 h-3.5 animate-pulse" />
                      NEURAL_CORE_STREAM_V4.log
                  </div>
                  <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                      <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                  </div>
              </div>
              <div 
                ref={scrollRef}
                className="p-4 max-h-[40vh] overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-300 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
              >
                  <span className="text-indigo-500 mr-2">root@ai:~$</span>
                  <span className="whitespace-pre-wrap">{cleanLog}</span>
                  <span className="inline-block w-2 h-4 align-middle bg-indigo-500 ml-1 animate-pulse"></span>
              </div>
          </div>
      )}

      {/* BARRA DE STATUS INFERIOR */}
      <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl p-4 w-full max-w-lg mx-auto animate-in slide-in-from-bottom-4 ring-1 ring-white/10 pointer-events-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-md opacity-40 animate-pulse"></div>
              {status.mode === 'thinking' ? (
                 <BrainCircuit className="w-5 h-5 text-indigo-400 relative z-10 animate-pulse" />
              ) : (
                 <Terminal className="w-5 h-5 text-emerald-400 relative z-10" />
              )}
            </div>
            <div>
                <span className="text-sm font-bold text-white tracking-wide block flex items-center gap-2">
                    {status.mode === 'thinking' ? 'Raciocínio Lógico' : 
                     status.mode === 'coding' ? 'Escrevendo Código' :
                     'Processando...'}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    {status.logs[status.logs.length - 1]?.message || 'Inicializando...'}
                </span>
            </div>
          </div>
          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        </div>

        {/* Barra de Progresso */}
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ease-out ${status.mode === 'thinking' ? 'bg-indigo-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.max(5, status.progress)}%` }}
          />
        </div>
      </div>
    </div>
  );
};