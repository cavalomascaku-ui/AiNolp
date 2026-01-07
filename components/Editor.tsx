
import React, { useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { EditorThemeColors } from '../types';

interface CodeEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  readOnly?: boolean;
  highlightSnippet?: string;
  errorLine?: number;
  language?: string;
  theme?: string;
  customTheme?: EditorThemeColors; // Objeto de cores customizadas
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  code, 
  onChange, 
  readOnly = false, 
  highlightSnippet, 
  errorLine, 
  language = 'html', 
  theme = 'devgame-neon',
  customTheme 
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsCollectionRef = useRef<any>(null);
  const errorDecorationsRef = useRef<any>(null);

  const defineThemes = (monaco: any) => {
    // PRESETS
    monaco.editor.defineTheme('devgame-neon', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'F8F8F2' }, 
        { token: 'comment', foreground: '6272A4', fontStyle: 'italic' }, 
        { token: 'string', foreground: 'F1FA8C' },
        { token: 'keyword', foreground: 'FF79C6', fontStyle: 'bold' },
        { token: 'identifier', foreground: '8BE9FD' }, 
        { token: 'type.identifier', foreground: '8BE9FD' }, 
        { token: 'function', foreground: '50FA7B' },
        { token: 'number', foreground: 'BD93F9' },
        { token: 'delimiter', foreground: 'F8F8F2' },
        { token: 'tag', foreground: 'FF79C6' },
        { token: 'attribute.name', foreground: '50FA7B' },
        { token: 'attribute.value', foreground: 'F1FA8C' },
        { token: 'delimiter.html', foreground: '6272A4' },
      ],
      colors: {
        'editor.background': '#09090b',
        'editor.foreground': '#F8F8F2',
        'editor.lineHighlightBackground': '#18181b',
        'editorCursor.foreground': '#FF79C6',
        'editorIndentGuide.background': '#27272a',
        'editorLineNumber.foreground': '#52525b',
      }
    });

    // Outros presets omitidos para brevidade, já que são carregados nativamente ou definidos acima
    // Opcionalmente, pode-se manter os outros defines aqui (dracula, monokai, etc.)
  };

  const updateCustomTheme = (monaco: any) => {
    if (theme === 'custom' && customTheme) {
        monaco.editor.defineTheme('custom', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: '', foreground: customTheme.foreground.replace('#', '') },
                { token: 'comment', foreground: customTheme.comment.replace('#', ''), fontStyle: 'italic' },
                { token: 'string', foreground: customTheme.string.replace('#', '') },
                { token: 'keyword', foreground: customTheme.keyword.replace('#', ''), fontStyle: 'bold' },
                { token: 'identifier', foreground: customTheme.foreground.replace('#', '') },
                { token: 'type.identifier', foreground: customTheme.foreground.replace('#', '') },
                { token: 'function', foreground: customTheme.function.replace('#', '') },
                { token: 'number', foreground: customTheme.number.replace('#', '') },
                { token: 'tag', foreground: customTheme.keyword.replace('#', '') },
                { token: 'attribute.name', foreground: customTheme.function.replace('#', '') },
                { token: 'attribute.value', foreground: customTheme.string.replace('#', '') },
            ],
            colors: {
                'editor.background': customTheme.background,
                'editor.foreground': customTheme.foreground,
                'editor.lineHighlightBackground': '#ffffff10',
                'editorCursor.foreground': customTheme.keyword,
                'editorIndentGuide.background': '#ffffff20',
                'editorLineNumber.foreground': '#ffffff50',
            }
        });
        monaco.editor.setTheme('custom');
    } else {
        monaco.editor.setTheme(theme);
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    decorationsCollectionRef.current = editor.createDecorationsCollection([]);
    errorDecorationsRef.current = editor.createDecorationsCollection([]);

    defineThemes(monaco);
    updateCustomTheme(monaco);
  };

  // Efeito para trocar o tema dinamicamente
  useEffect(() => {
    if (monacoRef.current) {
        updateCustomTheme(monacoRef.current);
    }
  }, [theme, customTheme]);

  // Efeito para highlight de erro
  useEffect(() => {
    if (editorRef.current && monacoRef.current && errorDecorationsRef.current) {
      if (errorLine && errorLine > 0) {
        const range = new monacoRef.current.Range(errorLine, 1, errorLine, 1);
        errorDecorationsRef.current.set([
          {
            range: range,
            options: {
              isWholeLine: true,
              className: 'error-line-decoration',
              linesDecorationsClassName: 'error-gutter-decoration',
              hoverMessage: { value: '**Erro detectado aqui**' },
              minimap: { color: '#ef4444', position: 1 }
            }
          }
        ]);
        if (!highlightSnippet) {
            editorRef.current.revealLineInCenter(errorLine);
        }
      } else {
        errorDecorationsRef.current.clear();
      }
    }
  }, [errorLine]);

  // Flash highlight effect
  useEffect(() => {
    if (editorRef.current && highlightSnippet && decorationsCollectionRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const matches = model.findMatches(highlightSnippet, false, false, false, null, true);
        if (matches && matches.length > 0) {
          const range = matches[0].range;
          editorRef.current.revealRangeInCenter(range);
          decorationsCollectionRef.current.set([
            {
              range: range,
              options: { isWholeLine: false, className: 'ai-flash-decoration', linesDecorationsClassName: 'ai-gutter-decoration' }
            }
          ]);
          setTimeout(() => {
            if (decorationsCollectionRef.current) decorationsCollectionRef.current.clear();
          }, 2000);
        }
      }
    }
  }, [code, highlightSnippet]);

  // Background color style injection for container to match editor
  const getBackgroundColor = () => {
      if (theme === 'custom' && customTheme) return customTheme.background;
      if (theme === 'monokai') return '#272822';
      if (theme === 'dracula') return '#282a36';
      if (theme === 'github-dark') return '#0d1117';
      if (theme === 'midnight') return '#000000';
      return '#09090b'; // devgame-neon
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-none border-none shadow-none relative transition-colors duration-300" style={{ backgroundColor: getBackgroundColor() }}>
      <Editor
        height="100%"
        language={language} 
        theme={theme === 'custom' ? 'custom' : theme}
        value={code}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace", 
          fontLigatures: true,
          wordWrap: 'on',
          readOnly: readOnly,
          padding: { top: 20, bottom: 20 },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          smoothScrolling: false, 
          cursorBlinking: 'smooth',
          renderLineHighlight: 'line',
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
        }}
      />
    </div>
  );
};
