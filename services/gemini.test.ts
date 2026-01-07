
import { describe, it, expect, vi } from 'vitest';
import { analyzeAndEditCode } from './gemini';

// Mock the GoogleGenAI library
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent
      }
    })),
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY'
    }
  };
});

describe('analyzeAndEditCode Service', () => {
  it('should send correct prompt and parse JSON response', async () => {
    const currentCode = '<div>Hello</div>';
    const files = { 'index.html': currentCode };
    const userPrompt = 'Make it say Goodbye';

    // Mock successful response
    const mockResponseText = JSON.stringify({
      thoughtProcess: 'Updating text content',
      patches: [
        {
          description: 'Change greeting',
          originalSnippet: 'Hello',
          newSnippet: 'Goodbye'
        }
      ]
    });

    mockGenerateContent.mockResolvedValue({
      text: mockResponseText
    });

    const result = await analyzeAndEditCode(files, userPrompt);

    expect(result.thoughtProcess).toBe('Updating text content');
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].newSnippet).toBe('Goodbye');
    
    // Verify the prompt contained the user's request
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining(userPrompt)
            })
          ])
        })
      })
    );
  });

  it('should throw error if AI returns empty text', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });
    
    await expect(analyzeAndEditCode({ 'index.html': 'code' }, 'prompt')).rejects.toThrow('Resposta vazia da IA');
  });

  it('should use thinking config when requested', async () => {
    mockGenerateContent.mockResolvedValue({ 
      text: JSON.stringify({ thoughtProcess: 'ok', patches: [] }) 
    });

    await analyzeAndEditCode({ 'index.html': 'code' }, 'prompt', [], true); // Use thinking model

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3-pro-preview', // Should use pro model
        config: expect.objectContaining({
          thinkingConfig: { thinkingBudget: 16000 }
        })
      })
    );
  });
});