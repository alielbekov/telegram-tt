import { Token, TokenType } from './types';

export class Tokenizer {
  private input: string;
  private position: number;
  private tokens: Token[];
  private withMarkdownLinks: boolean;
  private start: number;
  private lastWasNewline: boolean;

  constructor(input: string, withMarkdownLinks = true) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
    this.withMarkdownLinks = withMarkdownLinks;
    this.start = 0;
    this.lastWasNewline = true; // Start as true to handle opening marks
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.input[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.input.length) return '\0';
    return this.input[this.position + 1];
  }

  private peekPrev(): string {
    if (this.position <= 0) return '\0';
    return this.input[this.position - 1];
  }

  private advance(): string {
    const char = this.input[this.position++];
    if (char === '\n') {
      this.lastWasNewline = true;
    } else if (char !== ' ' && char !== '\t' && char !== '\r') {
      this.lastWasNewline = false;
    }
    return char;
  }

  private addToken(type: TokenType, value: string = '') {
    const token = {
      type,
      value: value || this.input.slice(this.start, this.position),
      position: this.start,
    };
    this.tokens.push(token);
  }

  private isEscaped(): boolean {
    if (this.position === 0) return false;
    let count = 0;
    let pos = this.position - 1;
    while (pos >= 0 && this.input[pos] === '\\') {
      count++;
      pos--;
    }
    return count % 2 === 1;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.input[this.position] !== expected) return false;
    this.position++;
    return true;
  }

  tokenize(): Token[] {
    // First, replace HTML entities
    this.input = this.input.replace(/&nbsp;/g, ' ');

    // Replace <div><br></div> with newline (new line in Safari)
    this.input = this.input.replace(/<div><br([^>]*)?><\/div>/g, '\n');
    // Replace <br> with newline
    this.input = this.input.replace(/<br([^>]*)?>/g, '\n');

    // Strip redundant <div> tags
    this.input = this.input.replace(/<\/div>(\s*)<div>/g, '\n');
    this.input = this.input.replace(/<div>/g, '\n');
    this.input = this.input.replace(/<\/div>/g, '');

    while (!this.isAtEnd()) {
      this.start = this.position;
      this.scanToken();
    }

    this.addToken('EOF');
    return this.tokens;
  }

  private scanToken(): void {
    const char = this.advance();

    // If character is escaped, add it as text
    if (this.isEscaped()) {
      this.addToken('TEXT', char);
      return;
    }

    switch (char) {
      case '*':
        if (this.match('*')) {
          this.addToken('DOUBLE_ASTERISK');
        } else {
          this.addToken('ASTERISK');
        }
        break;

      case '_':
        if (this.match('_')) {
          this.addToken('DOUBLE_UNDERSCORE');
        } else {
          this.addToken('UNDERSCORE');
        }
        break;

      case '~':
        if (this.match('~')) {
          this.addToken('DOUBLE_TILDE');
        } else {
          this.addToken('TILDE');
        }
        break;

      case '|':
        if (this.match('|')) {
          this.addToken('DOUBLE_PIPE');
        } else {
          this.addToken('TEXT', '|');
        }
        break;

      case '`':
        if (this.match('`')) {
          if (this.match('`')) {
            // We found three backticks. Check if we're at the start of a line for opening
            // Always tokenize triple backticks, but mark them differently if they're at start of line
            this.addToken(this.lastWasNewline || this.tokens.length === 0 ? 'TRIPLE_BACKTICK' : 'TRIPLE_BACKTICK_INLINE');
          } else {
            this.addToken('DOUBLE_BACKTICK');
          }
        } else {
          this.addToken('BACKTICK');
        }
        break;

      case '>':
        if (this.match('>')) {
          this.addToken('DOUBLE_GT');
        } else {
          this.addToken('GT');
        }
        break;

      case '\n':
        this.addToken('NEWLINE');
        break;

      case ' ':
      case '\r':
      case '\t':
        // Add whitespace as text
        this.addToken('TEXT', char);
        break;

      case '<':
        // Always treat HTML tags as plain text
        let text = char;
        while (!this.isAtEnd()) {
          text += this.advance();
          // Break if we find a closing bracket or newline
          if (text.endsWith('>') || this.previous() === '\n') {
            break;
          }
        }
        this.addToken('TEXT', text);
        break;

      default:
        // Collect text until we hit a special character that's not escaped
        while (!this.isAtEnd()) {
          const next = this.peek();
          if ('*_~|`>\n\\'.includes(next)) {
            break;
          }
          this.advance();
        }
        this.addToken('TEXT');
    }
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\r';
  }

  private previous(): string {
    return this.input[this.position - 1];
  }
}
