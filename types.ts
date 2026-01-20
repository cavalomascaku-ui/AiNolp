export interface CodePatch {
  targetFile: string; // Nome do arquivo alvo (ex: 'index.html', 'admin.html')
  action: 'update' | 'create' | 'delete';
  description: string;
  originalSnippet?: string; // Obrigatório apenas para 'update'
  newSnippet?: string; // Conteúdo novo (para create) ou substituto (para update)
}

export interface AiResponse {
  thoughtProcess: string;
  changelog?: string[]; 
  patches: CodePatch[];
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
  CHAT = 'CHAT'
}

export interface AgentLog {
  message: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'thinking';
}

export interface AgentStatus {
  isActive: boolean;
  mode: 'idle' | 'thinking' | 'cloning' | 'coding' | 'debugging' | 'scanning' | 'raptor' | 'attacking';
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

export type SearchSourceType = 'lexica' | 'web' | 'reddit' | 'opengameart' | 'itchio' | 'deviantart' | 'sketchfab';

export interface ImageResult {
  url: string; // Para 3D, isso será o link de embed ou página
  title: string;
  type: 'image' | 'gif' | 'model3d';
  source?: string;
  thumbnail?: string; // Obrigatório para 3D
  embedHtml?: string; // HTML pré-fabricado para facilitar para a IA
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
}