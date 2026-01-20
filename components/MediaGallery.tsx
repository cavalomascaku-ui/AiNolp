
import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, CheckCircle2, Loader2, Plus, ExternalLink, AlertTriangle, Box, Globe2, BookOpen, Sparkles, Filter, Grid, SlidersHorizontal, Feather, Layers, Camera, Palette, Hexagon, Film, Paperclip, Zap, Gamepad2, Scissors, Cuboid } from 'lucide-react';
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
    
    // Para Sketchfab, usamos a thumbnail fornecida, não a URL principal (que é o link do embed)
    const displaySrc = is3D && img.thumbnail ? img.thumbnail : img.url;
    
    const friendlyDomains = ['reddit.com', 'redd.it', 'imgur.com', 'wikimedia.org', 'lexica.art', 'images.unsplash.com', 'media.giphy.com', 'itch.io', 'opengameart.org', 'sketchfab.com'];
    const isFriendly = friendlyDomains.some(d => displaySrc.includes(d));

    const initialSrc = (is3D || isFriendly) ? displaySrc : PROXY_1(displaySrc);

    const [imgSrc, setImgSrc] = useState(initialSrc);
    const [hasError, setHasError] = useState(false);
    const [retryStage, setRetryStage] = useState(0);

    const handleError = () => {
        if (is3D) { 
            // Se falhar thumbnail 3D, tenta proxy
            if (retryStage === 0) {
                setImgSrc(PROXY_2(displaySrc));
                setRetryStage(1);
            } else {
                setHasError(true); 
            }
            return; 
        }

        if (retryStage === 0 && !isFriendly) {
            setImgSrc(displaySrc);
            setRetryStage(1);
        } else if (retryStage === 1 && !isFriendly) {
            setImgSrc(PROXY_2(displaySrc));
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
            
            {is3D && (
                <div className="absolute top-2 left-2 z-30">
                    <span className="text-[8px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1">
                        <Cuboid className="w-2.5 h-2.5" /> 3D
                    </span>
                </div>
            )}

            <img 
                src={imgSrc} 
                alt={img.title}
                className={`absolute inset-0 w-full h-full object-cover z-10 transition-transform duration-500 group-hover:scale-110 ${isGif ? 'bg-white/5' : ''}`}
                loading="lazy"
                onError={handleError}
            />
            
            {!is3D && (
                <div className="absolute top-2 left-2 z-20">
                     <div className={`bg-zinc-950/90 backdrop-blur-sm text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-zinc-700/50 uppercase text-zinc-300`}>
                         {img.source ? img.source.substring(0, 8) : 'WEB'}
                     </div>
                </div>
            )}

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
  const [localLoading, setLocalLoading] = useState(false);

  const FILTERS = [
      { id: 'transparent', label: 'Transparente (PNG)', icon: <Layers className="w-3 h-3" />, promptMod: 'transparent background png stickert' },
      { id: 'spritesheet', label: 'Sprite Sheet', icon: <Grid className="w-3 h-3 text-yellow-400" />, promptMod: 'sprite sheet texture atlas game animation frame' },
      { id: 'pixelart', label: 'Pixel Art', icon: <Gamepad2 className="w-3 h-3" />, promptMod: 'pixel art 8-bit 16-bit' },
      { id: 'texture', label: 'Textura', icon: <Box className="w-3 h-3" />, promptMod: 'seamless texture pattern surface' },
      { id: 'ui', label: 'UI / GUI', icon: <Box className="w-3 h-3" />, promptMod: 'game ui gui hud button interface' },
      { id: 'background', label: 'Cenário', icon: <Box className="w-3 h-3" />, promptMod: 'game background landscape environment' }
  ];

  const SOURCES: {id: SearchSourceType, label: string}[] = [
      { id: 'sketchfab', label: 'Sketchfab (3D)' },
      { id: 'lexica', label: 'Lexica (IA)' },
      { id: 'web', label: 'Google' }, // Fallback to web
      { id: 'reddit', label: 'Reddit' },
      { id: 'opengameart', label: 'OpenGameArt' },
      { id: 'itchio', label: 'Itch.io' },
  ];
  const [activeSources, setActiveSources] = useState<SearchSourceType[]>(['sketchfab', 'lexica', 'web']);

  // Handle external triggers (Auto-Search from AI)
  useEffect(() => {
      if (triggerQuery && autoSearchEnabled) {
          setQuery(triggerQuery);
          handleSearch(triggerQuery);
      }
  }, [triggerQuery]);

  const searchSketchfab = async (q: string): Promise<ImageResult[]> => {
      try {
          // Filtros: models, downloadable (para garantir que é um asset usável, embora vamos usar embed)
          const url = `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(q)}&sort_by=-likeCount`;
          // Usando proxy para evitar CORS se necessário, embora a API search do Sketchfab geralmente aceite.
          // Mas vamos usar proxy para garantir.
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          
          const res = await fetch(proxyUrl);
          if (!res.ok) return [];
          const data = await res.json();
          
          if (!data.results) return [];

          return data.results.map((r: any) => {
              // Pegar a maior thumbnail disponível
              const thumbnails = r.thumbnails.images.sort((a: any, b: any) => b.width - a.width);
              const thumbUrl = thumbnails.length > 0 ? thumbnails[0].url : '';
              
              // Gerar código de embed
              const embedUrl = `https://sketchfab.com/models/${r.uid}/embed?autostart=1&ui_controls=1&ui_infos=0&ui_inspector=0&ui_stop=0&ui_watermark=0&ui_watermark_link=0`;
              const iframeCode = `<iframe title="${r.name}" frameborder="0" allowfullscreen mozallowfullscreen="true" webkitallowfullscreen="true" allow="autoplay; fullscreen; xr-spatial-tracking" xr-spatial-tracking execution-while-out-of-viewport execution-while-not-rendered web-share src="${embedUrl}"></iframe>`;

              return {
                  url: embedUrl, // URL principal é o embed
                  title: r.name,
                  type: 'model3d',
                  source: 'sketchfab',
                  thumbnail: thumbUrl,
                  embedHtml: iframeCode
              };
          });
      } catch (e) {
          console.error("Sketchfab Error:", e);
          return [];
      }
  };

  const handleSearch = async (overrideQuery?: string) => {
      const q = overrideQuery || query;
      if (!q.trim()) return;
      
      setHasSearched(true);
      setLocalLoading(true);
      setResults([]);
      setSelectedIndices(new Set());

      // Combine prompt with active filters
      let finalQuery = q;
      activeFilters.forEach(fid => {
          const f = FILTERS.find(filter => filter.id === fid);
          if (f) finalQuery += ` ${f.promptMod}`;
      });

      try {
          const promises: Promise<ImageResult[]>[] = [];

          // Se Sketchfab estiver ativo, busca em paralelo
          if (activeSources.includes('sketchfab')) {
              promises.push(searchSketchfab(q)); // Busca sketchfab usa a query original sem modificadores de imagem
          }

          // Busca nas outras fontes via callback principal
          const otherSources = activeSources.filter(s => s !== 'sketchfab');
          if (otherSources.length > 0) {
              promises.push(onSearch(finalQuery, activeFilters, otherSources));
          }

          const resultsArray = await Promise.all(promises);
          const flatResults = resultsArray.flat();
          
          // Shuffle leve para misturar fontes
          setResults(flatResults.sort(() => Math.random() - 0.5));
      } catch (e) {
          console.error(e);
      } finally {
          setLocalLoading(false);
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
      const has3D = selectedImages.some(i => i.type === 'model3d');
      
      let enhancedQuery = query;
      if (isSpriteSheet) enhancedQuery += " [TYPE: SPRITE_SHEET]";
      if (has3D) enhancedQuery += " [TYPE: 3D_MODEL_EMBED]";
      
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
                        placeholder="Busque assets (ex: 'Soldado', 'Espada')..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-pink-500/50 focus:outline-none placeholder:text-zinc-600"
                    />
                </div>

                <button 
                    onClick={() => handleSearch()}
                    disabled={(isSearching || localLoading) || !query.trim()}
                    className="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-6 rounded-xl font-bold transition-all shadow-lg shadow-pink-900/20"
                >
                    {(isSearching || localLoading) ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Buscar'}
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
                    <p className="text-sm">Busque texturas, sprites ou modelos 3D.</p>
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
            {(isSearching || localLoading) && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                    <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-3" />
                    <p className="text-zinc-300 font-mono text-xs animate-pulse">RASTREANDO ASSETS (Sketchfab & Web)...</p>
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
