import React, { useState, useEffect } from 'react';
import { Github, Lock, Search, UploadCloud, CheckCircle2, AlertCircle, X, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { GitHubUser, GitHubRepo, ProjectFiles } from '../types';
import { validateGitHubToken, getUserRepos, pushToGitHub } from '../services/github';

interface GitHubModalProps {
    isOpen: boolean;
    onClose: () => void;
    files: ProjectFiles;
}

export const GitHubModal: React.FC<GitHubModalProps> = ({ isOpen, onClose, files }) => {
    const [token, setToken] = useState('');
    const [user, setUser] = useState<GitHubUser | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
    const [search, setSearch] = useState('');
    const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
    const [commitMessage, setCommitMessage] = useState('Update project via DevGame');
    const [step, setStep] = useState<'auth' | 'select' | 'push'>('auth');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successUrl, setSuccessUrl] = useState('');

    useEffect(() => {
        const savedToken = localStorage.getItem('github_pat');
        if (savedToken) {
            setToken(savedToken);
            verifyToken(savedToken);
        }
    }, []);

    useEffect(() => {
        if (repos.length > 0) {
            setFilteredRepos(repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase())));
        }
    }, [search, repos]);

    const verifyToken = async (t: string) => {
        setLoading(true);
        setError('');
        const userData = await validateGitHubToken(t);
        if (userData) {
            setUser(userData);
            localStorage.setItem('github_pat', t);
            await fetchRepos(t);
            setStep('select');
        } else {
            setError('Token inválido ou expirado.');
        }
        setLoading(false);
    };

    const fetchRepos = async (t: string) => {
        const r = await getUserRepos(t);
        setRepos(r);
        setFilteredRepos(r);
    };

    const handlePush = async () => {
        if (!user || !selectedRepo) return;
        setLoading(true);
        setError('');
        
        // Assume owner is the login user for now, or extract from full_name
        const owner = selectedRepo.full_name.split('/')[0];
        
        const result = await pushToGitHub(token, owner, selectedRepo.name, selectedRepo.default_branch, files, commitMessage);
        
        if (result.success) {
            setStep('push');
            setSuccessUrl(result.url || '');
        } else {
            setError(result.error || 'Erro ao realizar push.');
        }
        setLoading(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('github_pat');
        setToken('');
        setUser(null);
        setStep('auth');
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-zinc-950 border border-zinc-800 shadow-2xl rounded-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-black">
                    <div className="flex items-center gap-2">
                        <Github className="w-5 h-5 text-white" />
                        <h3 className="font-bold text-white">Integração GitHub</h3>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-zinc-500 hover:text-white" /></button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {step === 'auth' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 text-center">
                                <Lock className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                                <p className="text-xs text-zinc-400">
                                    Para segurança, usamos um <strong>Personal Access Token (Classic)</strong>.
                                    O app roda no seu navegador, o token não é salvo em nossos servidores.
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-zinc-300 mb-1 block">Seu Token (Escopo: 'repo')</label>
                                <input 
                                    type="password" 
                                    value={token} 
                                    onChange={(e) => setToken(e.target.value)}
                                    className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none" 
                                    placeholder="ghp_..."
                                />
                            </div>
                            <button 
                                onClick={() => verifyToken(token)} 
                                disabled={loading || !token}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Autenticar'}
                            </button>
                            {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50">{error}</div>}
                            <a href="https://github.com/settings/tokens/new?scopes=repo&description=DevGame+Sync" target="_blank" className="block text-[10px] text-center text-indigo-400 hover:underline">
                                Gerar Token no GitHub &rarr;
                            </a>
                        </div>
                    )}

                    {step === 'select' && user && (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <img src={user.avatar_url} className="w-6 h-6 rounded-full" />
                                    <span className="text-sm font-bold text-zinc-300">{user.login}</span>
                                </div>
                                <button onClick={handleLogout} className="text-xs text-red-400 hover:underline">Sair</button>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input 
                                    type="text" 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Buscar repositório..."
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg max-h-[200px] bg-zinc-900/50">
                                {filteredRepos.map(repo => (
                                    <button
                                        key={repo.id}
                                        onClick={() => setSelectedRepo(repo)}
                                        className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800/50 flex justify-between items-center ${selectedRepo?.id === repo.id ? 'bg-indigo-900/30 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                                    >
                                        <span className="truncate">{repo.name}</span>
                                        {selectedRepo?.id === repo.id && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                                    </button>
                                ))}
                            </div>

                            {selectedRepo && (
                                <div className="animate-in slide-in-from-bottom-2 space-y-3 pt-2">
                                    <div className="p-2 bg-indigo-900/20 border border-indigo-500/30 rounded text-[10px] text-indigo-200">
                                        Destino: <strong>{selectedRepo.full_name}</strong> (Branch: {selectedRepo.default_branch})
                                    </div>
                                    <input 
                                        type="text" 
                                        value={commitMessage}
                                        onChange={(e) => setCommitMessage(e.target.value)}
                                        placeholder="Mensagem do Commit"
                                        className="w-full bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                                    />
                                    <button 
                                        onClick={handlePush}
                                        disabled={loading}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UploadCloud className="w-4 h-4" /> Push Files</>}
                                    </button>
                                    {error && <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-900/50">{error}</div>}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'push' && (
                        <div className="text-center py-8 space-y-4">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Sucesso!</h3>
                            <p className="text-sm text-zinc-400">Seu código foi enviado para o GitHub.</p>
                            <a 
                                href={successUrl} 
                                target="_blank" 
                                className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-bold bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800 hover:border-indigo-500 transition-all"
                            >
                                Ver no GitHub <ExternalLink className="w-4 h-4" />
                            </a>
                            <button onClick={onClose} className="block w-full text-zinc-500 text-xs mt-4 hover:text-white">Fechar</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};