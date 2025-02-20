import { Tokenizer } from './tokenizer';
import { Parser } from './parser';
import { Generator } from './generator';

function preprocessHtml(input: string): string {
  let text = input;

  // Handle HTML entities
  text = text.replace(/&nbsp;/g, ' ');

  // Handle escaped characters
  text = text.replace(/\\([1-~]|[_*[\]()~`>#+=\-|{}.!])/g, (match, char) => {
    return `\uE000${char.charCodeAt(0)}\uE001`;
  });

  // Handle HTML line breaks
  text = text.replace(/<div><br([^>]*)?><\/div>/g, '\n');
  text = text.replace(/<br([^>]*)?>/g, '\n');
  text = text.replace(/<\/div>(\s*)<div>/g, '\n');
  text = text.replace(/<div>/g, '\n');
  text = text.replace(/<\/div>/g, '');

  return text;
}

function restoreEscapedChars(input: string): string {
  return input.replace(/\uE000(\d+)\uE001/g, (match, charCode) => {
    return String.fromCharCode(Number(charCode));
  });
}

export function parseMarkdown(input: string, withMarkdownLinks = false): string {
  // 1. Preprocess HTML
  const preprocessed = preprocessHtml(input);

  // 2. Tokenize the input
  const tokenizer = new Tokenizer(preprocessed, withMarkdownLinks);
  const tokens = tokenizer.tokenize();

  // 3. Parse tokens into AST
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // 4. Generate HTML from AST
  const generator = new Generator();
  const html = generator.generate(ast);

  // 5. Restore escaped characters
  return restoreEscapedChars(html);
}

// Re-export types
export * from './types';
