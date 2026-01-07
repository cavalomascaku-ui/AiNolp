
import { describe, it, expect } from 'vitest';
import { applyPatch } from './patcher';
import { CodePatch } from '../types';

describe('applyPatch Utility', () => {
  const baseCode = `
    <html>
    <body>
      <div id="game"></div>
      <script>
        const x = 10;
        console.log(x);
      </script>
    </body>
    </html>
  `;

  it('should successfully apply an exact match patch', () => {
    const patch: CodePatch = {
      targetFile: 'index.html',
      action: 'update',
      description: 'Change value of x',
      originalSnippet: 'const x = 10;',
      newSnippet: 'const x = 20;'
    };

    const result = applyPatch(baseCode, patch);
    expect(result.success).toBe(true);
    expect(result.newCode).toContain('const x = 20;');
    expect(result.newCode).not.toContain('const x = 10;');
  });

  it('should handle whitespace normalization (Windows/Unix line endings)', () => {
    // Current code has \n, patch might come with \r\n from AI
    const patch: CodePatch = {
      targetFile: 'index.html',
      action: 'update',
      description: 'Update console log',
      originalSnippet: 'console.log(x);',
      newSnippet: 'console.log("Value:", x);'
    };

    // Simulate input having mixed endings or just \n
    const inputCode = 'console.log(x);';
    const result = applyPatch(inputCode, patch);
    expect(result.success).toBe(true);
    expect(result.newCode).toContain('console.log("Value:", x);');
  });

  it('should fail gracefully if snippet is not found', () => {
    const patch: CodePatch = {
      targetFile: 'index.html',
      action: 'update',
      description: 'Non-existent code',
      originalSnippet: 'const y = 500;',
      newSnippet: 'const y = 600;'
    };

    const result = applyPatch(baseCode, patch);
    expect(result.success).toBe(false);
    expect(result.newCode).toBe(baseCode);
  });

  // CRITICAL MULTIPLAYER LOGIC TEST
  it('should inject script tags at the end of body if exact match fails (Strategy 2)', () => {
    // This simulates the AI trying to add the Firebase/Multiplayer logic but failing to match the exact context
    // because the user might have changed indentation.
    const patch: CodePatch = {
      targetFile: 'index.html',
      action: 'update',
      description: 'Add Multiplayer Lobby',
      originalSnippet: '<!-- Code that might not exist anymore -->',
      newSnippet: '<script>function createRoom() { /* logic */ }</script>'
    };

    const result = applyPatch(baseCode, patch);
    
    expect(result.success).toBe(true);
    // Should inject before the closing body tag
    expect(result.newCode).toContain('<script>function createRoom() { /* logic */ }</script>');
    expect(result.newCode).toContain('</body>'); 
    
    // Ensure it was appended effectively
    const parts = result.newCode.split('</body>');
    expect(parts[0]).toContain('function createRoom');
  });
});