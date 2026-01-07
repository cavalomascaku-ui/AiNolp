
export interface CodePatch {
  targetFile: string; // Nome do arquivo alvo (ex: 'index.html', 'admin.html')
  action: 'update' | 'create' | 'delete';
  description: string;
  originalSnippet?: string; // Obrigatório apenas para 'update'
  newSnippet?: string; // Conteúdo novo (para create) ou substituto (para update)
}

export interface SearchSource {
  title: string;
  uri: string;
}

export interface AiResponse {
  thoughtProcess: string;
  changelog?: string[]; 
  patches: CodePatch[];
  searchSources?: SearchSource[]; // Novas fontes de pesquisa
  suggestedAssetQuery?: string; // NOVO: A IA sugere uma busca de imagem
}

export interface SecurityVulnerability {
  file: string;
  line: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  description: string;
  exploitExample: string; // O payload para testar
}

export interface SecurityReport {
  vulnerabilities: SecurityVulnerability[];
  summary: string;
  isSafe: boolean;
}

// NOVO: Estrutura para ataques práticos
export interface ExploitVector {
  targetInput: string; // Onde inserir (ex: URL param '?id=', Input field 'user')
  payload: string; // O código malicioso exato
  expectedResult: string; // O que deve acontecer (ex: Pop-up alert(1), Redirecionamento)
  technicalBasis: string; // Por que funciona baseado no código analisado
  confidence: 'CERTAIN' | 'PROBABLE' | 'EXPERIMENTAL';
}

export interface ExtractedVideo {
  src: string;
  type: 'mp4' | 'youtube' | 'vimeo' | 'iframe' | 'unknown';
  poster?: string;
}

export interface ImageResult {
  url: string;
  thumbnail?: string;
  title: string;
  source: string;
  isGenerated?: boolean; // Se foi gerada por IA na hora
  type?: 'image' | 'model3d' | 'gif'; // Suporte a modelos 3D e GIFs
}

export interface Attachment {
  mimeType: string;
  data: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isThinking?: boolean;
  attachments?: string[]; // NOVO: Lista de URLs/Base64 para renderizar no chat
}

export enum AppTab {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
  CHAT = 'CHAT',
  MEDIA = 'MEDIA'
}

export interface AgentLog {
  message: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'thinking';
}

export interface AgentStatus {
  isActive: boolean;
  mode: 'idle' | 'thinking' | 'cloning' | 'coding' | 'debugging' | 'scanning' | 'raptor' | 'attacking' | 'searching_images';
  logs: AgentLog[];
  progress: number; // 0 a 100
  estimatedSeconds: number;
}

export interface RuntimeError {
  message: string;
  line?: number;
  column?: number;
}

export type ProjectFiles = { [filename: string]: string };

export type PlatformTarget = 'mobile' | 'pc' | 'both';

export interface EditorThemeColors {
  background: string;
  foreground: string;
  keyword: string;
  string: string;
  function: string;
  comment: string;
  number: string;
}

export type SearchSourceType = 'lexica' | 'wiki' | 'web' | 'reddit' | 'artstation' | 'unsplash' | 'openverse' | 'deviantart' | 'giphy' | 'itchio' | 'opengameart';