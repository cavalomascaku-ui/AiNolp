
import React from 'react';
import { Loader2, BrainCircuit, Terminal } from 'lucide-react';
import { AgentStatus } from '../types';

interface AgentStatusProps {
  status: AgentStatus;
  streamContent?: string;
}

export const AgentStatusOverlay: React.FC<AgentStatusProps> = ({ status }) => {
  if (!status.isActive) return null;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex flex-col justify-end pb-6 px-6">
      {/* Container Flutuante Minimalista */}
      <div className="bg-zinc-900/90 backdrop-blur-md border border-indigo-500/30 rounded-xl shadow-2xl p-4 w-full max-w-lg mx-auto animate-in slide-in-from-bottom-4 ring-1 ring-white/10 pointer-events-auto">
        
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
                <span className="text-sm font-bold text-white tracking-wide block">
                    {status.mode === 'thinking' ? 'IA Planejando...' : 
                     status.mode === 'cloning' ? 'Clonando Site...' :
                     status.mode === 'raptor' ? 'Video Raptor Ativo...' :
                     status.mode === 'scanning' ? 'Varredura de Segurança...' :
                     'Gerando Código...'}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                    {status.logs[status.logs.length - 1]?.message || 'Processando...'}
                </span>
            </div>
          </div>
          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
        </div>

        {/* Barra de Progresso */}
        <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.max(5, status.progress)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
