
import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, CheckCircle2, Loader2, Plus, ExternalLink, AlertTriangle, Box, Globe2, BookOpen, Sparkles, Filter, Grid, SlidersHorizontal, Feather, Layers, Camera, Palette, Hexagon, Film, Paperclip, Zap, Gamepad2, Scissors } from 'lucide-react';
import { ImageResult, SearchSourceType } from '../types';

interface MediaGalleryProps {
  onSearch: (query: string, filters: string[], sources: SearchSourceType[]) => Promise<ImageResult[]>;
  onIntegrate: (images: ImageResult[], query: string) => void;
  isSearching: boolean;
  autoSearchEnabled?: boolean;
  toggleAutoSearch?: () => void;
  triggerQuery?: string;
}

interface GalleryItemProps {
    img: ImageResult;
    idx: number;
    isSelected: boolean;
    toggleSelection: (i: number) => void;
}

const GalleryItem: React.FC<GalleryItemProps> = ({ 
    img, 
    idx, 
    isSelected, 
    toggleSelection 
}) => {
    // Proxy robusto para imagens que bloqueiam hotlink
    const PROXY_1 = (url: string) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=400&fit=contain&output=webp`;
    const PROXY_2 = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    const is3D = img.type === 'model3d';
    const isGif = img.type === 'gif';
    
    const friendlyDomains = ['reddit.com', 'redd.it', 'imgur.com', 'wikimedia.org', 'lexica.art', 'images.unsplash.com', 'media.giphy.com', 'itch.io', 'opengameart.org'];
    const isFriendly = friendlyDomains.some(d => img.url.includes(d));

    const initialSrc = (is3D || isFriendly) ? img.url : PROXY_1(img.url);

    const [imgSrc, setImgSrc] = useState(initialSrc);
    const [hasError, setHasError] = useState(false);
    const [retryStage, setRetryStage] = useState(0);

    const handleError = () => {
        if (is3D) { setHasError(true); return; }

        if (retryStage === 0 && !isFriendly) {
            setImgSrc(img.url);
            setRetryStage(1);
        } else if (retryStage === 1 && !isFriendly) {
            setImgSrc(PROXY_2(img.url));
            setRetryStage(2);
        } else {
            setHasError(true);
        }
    };

    const getSourceDisplay = (urlStr?: string) => {
        if (img.source) return img.source;
        if (!urlStr) return 'unknown';
        try { return new URL(urlStr).hostname.replace('www.', '').split('.')[0]; } catch { return 'source'; }
    };

    if (hasError) return null; 

    return (
        <div 
            onClick={() => toggleSelection(idx)}
            className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)] scale-[1.02]' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900'}`}
        >
            <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/practicaldev/image/fetch/s--K6g6k9rX--/c_limit%2Cf_auto%2Cfl_progressive%2Cq_auto%2Cw_880/https://dev-to-uploads.s3.amazonaws.com/i/1wwdyw5de8avrdkgtz5n.png')] opacity-10"></div>
            
            {is3D ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-zinc-500">
                    <Box className="w-12 h-12 text-blue-500" />
                    <span className="text-[9px] mt-2 font-mono bg-blue-900/30 text-blue-300 px-1 rounded">3D MODEL</span>
                    <span className="text-[8px] mt-1 text-zinc-600 truncate max-w-[80%]">{getSourceDisplay(img.url)}</span>
                </div>
            ) : (
                <img 
                    src={imgSrc} 
                    alt={img.title}
                    className={`absolute inset-0 w-full h-full object-contain p-2 z-10 transition-opacity duration-300 group-hover:scale-105 ${isGif ? 'bg-white/5' : ''}`}
                    loading="lazy"
                    onError={handleError}
                />
            )}
            
            <div className="absolute top-2 left-2 z-20">
                 <div className={`bg-zinc-950/90 backdrop-blur-sm text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-zinc-700/50 uppercase text-zinc-300`}>
                     {img.source ? img.source.substring(0, 8) : 'WEB'}
                 </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-3 pt-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end">
                <p className="text-[10px] text-zinc-200 line-clamp-2 leading-tight">{img.title}</p>
                <div className="flex justify-between items-center mt-1">
                    <p className="text-[9px] text-zinc-500 truncate">{getSourceDisplay(img.url)}</p>
                </div>
            </div>

            <div className={`absolute top-2 right-2 z-30 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-pink-600 text-white scale-110 shadow-lg' : 'bg-black/50 text-zinc-500 border border-zinc-600 group-hover:bg-zinc-800 group-hover:text-zinc-300'}`}>
                <CheckCircle2 className="w-4 h-4" />
            </div>
        </div>
    );
};

export const MediaGallery: React.FC<MediaGalleryProps> = ({ onSearch, onIntegrate, isSearching, autoSearchEnabled, toggleAutoSearch, triggerQuery }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const FILTERS = [
      { id: 'transparent', label: 'Transparente (PNG)', icon: <Layers className="w-3 h-3" />, promptMod: 'transparent background png stickert' },
      { id: 'spritesheet', label: 'Sprite Sheet', icon: <Grid className="w-3 h-3 text-yellow-400" />, promptMod: 'sprite sheet texture atlas game animation frame' },
      { id: 'pixelart', label: 'Pixel Art', icon: <Gamepad2 className="w-3 h-3" />, promptMod: 'pixel art 8-bit 16-bit' },
      { id: 'texture', label: 'Textura', icon: <Box className="w-3 h-3" />, promptMod: 'seamless texture pattern surface' },
      { id: 'ui', label: 'UI / GUI', icon: <Box className="w-3 h-3" />, promptMod: 'game ui gui hud button interface' },
      { id: 'background', label: 'Cenário', icon: <Box className="w-3 h-3" />, promptMod: 'game background landscape environment' }
  ];

  const SOURCES: {id: SearchSourceType, label: string}[] = [
      { id: 'lexica', label: 'Lexica (IA)' },
      { id: 'web', label: 'Google' }, // Fallback to web
      { id: 'reddit', label: 'Reddit' },
      { id: 'opengameart', label: 'OpenGameArt' },
      { id: 'itchio', label: 'Itch.io' },
      { id: 'deviantart', label: 'DeviantArt' }
  ];
  const [activeSources, setActiveSources] = useState<SearchSourceType[]>(['lexica', 'web', 'reddit', 'opengameart', 'itchio']);

  // Handle external triggers (Auto-Search from AI)
  useEffect(() => {
      if (triggerQuery && autoSearchEnabled) {
          setQuery(triggerQuery);
          handleSearch(triggerQuery);
      }
  }, [triggerQuery]);

  const handleSearch = async (overrideQuery?: string) => {
      const q = overrideQuery || query;
      if (!q.trim()) return;
      
      setHasSearched(true);
      setResults([]);
      setSelectedIndices(new Set());

      // Combine prompt with active filters
      let finalQuery = q;
      activeFilters.forEach(fid => {
          const f = FILTERS.find(filter => filter.id === fid);
          if (f) finalQuery += ` ${f.promptMod}`;
      });

      try {
          // If "google" is selected, map to generic web search or specific logic inside service
          const sourcesToUse = activeSources;
          const imgs = await onSearch(finalQuery, activeFilters, sourcesToUse);
          setResults(imgs);
      } catch (e) {
          console.error(e);
      }
  };

  const toggleSelection = (idx: number) => {
      const newSet = new Set(selectedIndices);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      setSelectedIndices(newSet);
  };

  const handleIntegrateClick = () => {
      const selectedImages = results.filter((_, i) => selectedIndices.has(i));
      // Adiciona flag se for sprite sheet para ajudar o prompt no App.tsx
      const isSpriteSheet = activeFilters.includes('spritesheet');
      const enhancedQuery = isSpriteSheet ? query + " [TYPE: SPRITE_SHEET]" : query;
      
      onIntegrate(selectedImages, enhancedQuery);
  };

  return (
    <div className="flex flex-col h-full bg-black">
        {/* Header Search */}
        <div className="p-4 border-b border-zinc-900 bg-black/50 backdrop-blur-sm sticky top-0 z-40 space-y-3">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Busque assets (ex: 'nave espacial pixel art')..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-pink-500/50 focus:outline-none placeholder:text-zinc-600"
                    />
                </div>

                <button 
                    onClick={() => handleSearch()}
                    disabled={isSearching || !query.trim()}
                    className="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-6 rounded-xl font-bold transition-all shadow-lg shadow-pink-900/20"
                >
                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Buscar'}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveFilters(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${activeFilters.includes(f.id) ? 'bg-pink-900/30 border-pink-500 text-pink-300' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                    >
                        {f.icon} {f.label}
                    </button>
                ))}
                <div className="w-px h-6 bg-zinc-800 mx-1"></div>
                <button onClick={toggleAutoSearch} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${autoSearchEnabled ? 'bg-indigo-900/30 border-indigo-500 text-indigo-300' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}>
                    <Sparkles className="w-3 h-3" /> Auto-Search {autoSearchEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Fontes */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/50">
                <span className="text-[9px] font-bold text-zinc-600 flex items-center mr-1">FONTES:</span>
                {SOURCES.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSources(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                        className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${activeSources.includes(s.id) ? 'bg-zinc-800 border-zinc-600 text-zinc-300' : 'bg-transparent border-zinc-800 text-zinc-600 opacity-60 hover:opacity-100'}`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </div>

        {/* Grid Results */}
        <div className="flex-1 overflow-y-auto p-4 relative">
            {!hasSearched && results.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-600 opacity-50 pointer-events-none">
                    <ImageIcon className="w-16 h-16 mb-4" />
                    <p className="text-sm">Busque texturas, sprites ou conceitos.</p>
                </div>
            )}
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {results.map((img, idx) => (
                    <GalleryItem 
                        key={`${img.url}-${idx}`} 
                        img={img} 
                        idx={idx} 
                        isSelected={selectedIndices.has(idx)}
                        toggleSelection={toggleSelection}
                    />
                ))}
            </div>

            {/* Loading Overlay */}
            {isSearching && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                    <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-3" />
                    <p className="text-zinc-300 font-mono text-xs animate-pulse">RASTREANDO ASSETS...</p>
                </div>
            )}
        </div>

        {/* Footer Selection Action */}
        {selectedIndices.size > 0 && (
            <div className="p-4 border-t border-zinc-900 bg-zinc-950 flex items-center justify-between animate-in slide-in-from-bottom-5">
                <div className="text-xs text-zinc-400">
                    <strong className="text-white">{selectedIndices.size}</strong> assets selecionados
                </div>
                <button 
                    onClick={handleIntegrateClick}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-900/20 transition-all hover:scale-105"
                >
                    <Plus className="w-4 h-4" />
                    Usar no Projeto
                </button>
            </div>
        )}
    </div>
  );
};
