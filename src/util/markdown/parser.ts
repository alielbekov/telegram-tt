import { Token, TokenType, NodeType, ASTNode } from './types';

// Import language validation
import { getPrettyCodeLanguageName } from '../prettyCodeLanguageNames';

interface MarkerInfo {
  type: TokenType;
  nodeType: NodeType;
  symbol: string;
  closing: TokenType;
}

export class Parser {
  private tokens: Token[];
  private current: number;
  private activeMarkers: Set<TokenType>;

  private readonly MARKERS: MarkerInfo[] = [
    { type: 'DOUBLE_UNDERSCORE', nodeType: 'underline', symbol: '__', closing: 'DOUBLE_UNDERSCORE' },
    { type: 'DOUBLE_ASTERISK', nodeType: 'bold', symbol: '**', closing: 'DOUBLE_ASTERISK' },
    { type: 'UNDERSCORE', nodeType: 'italic', symbol: '_', closing: 'UNDERSCORE' },
    { type: 'ASTERISK', nodeType: 'bold', symbol: '*', closing: 'ASTERISK' },
    { type: 'TILDE', nodeType: 'strike', symbol: '~', closing: 'TILDE' },
    { type: 'DOUBLE_TILDE', nodeType: 'strike', symbol: '~~', closing: 'DOUBLE_TILDE' },
    { type: 'DOUBLE_PIPE', nodeType: 'spoiler', symbol: '||', closing: 'DOUBLE_PIPE' },
  ];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
    this.activeMarkers = new Set();
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private getMarkerInfo(type: TokenType): MarkerInfo | undefined {
    return this.MARKERS.find(m => m.type === type);
  }

  private parseNode(): ASTNode | undefined {
    // Handle text tokens
    if (this.match('TEXT', 'NEWLINE')) {
      return {
        type: 'text',
        value: this.previous().value,
      };
    }

    // Handle triple backtick code blocks
    if (this.match('TRIPLE_BACKTICK')) {
      let language = '';
      const codeContent: string[] = [];
      
      // Get language if specified on the first line
      let firstLine = '';
      let hasNewline = false;

      // Collect the first line if it exists
      while (!this.isAtEnd() && !this.check('TRIPLE_BACKTICK') && !this.check('TRIPLE_BACKTICK_INLINE')) {
        if (this.check('NEWLINE')) {
          hasNewline = true;
          break;
        }
        if (this.match('TEXT')) {
          firstLine += this.previous().value;
        } else {
          firstLine += this.advance().value;
        }
      }

      
      // If we have a first line and a newline after it, try to parse it as a language
      if (hasNewline && firstLine) {
        // Clean up first line and check if it's a valid language
        const potentialLang = firstLine.trim().toLowerCase();
        const prettyLang = getPrettyCodeLanguageName(potentialLang);
        
        // Only set language if it's a recognized language
        if (prettyLang) {
          language = potentialLang;
        } else {
          // If not a valid language, treat first line as content
          codeContent.push(firstLine);
        }
        // Consume the newline
        this.match('NEWLINE');
      } else if (firstLine) {
        // No newline after first line, treat it as content
        codeContent.push(firstLine);
      }

      // Collect all content until closing triple backtick
      let foundClosing = false;
      let lastWasNewline = false;
      while (!this.isAtEnd() && !foundClosing) {
        const nextToken = this.peek();
        
        // Check for closing backticks
        if (nextToken.type === 'TRIPLE_BACKTICK' || nextToken.type === 'TRIPLE_BACKTICK_INLINE') {
          foundClosing = true;
          this.advance(); // Consume the closing backticks
          break;
        }
        
        // Handle other tokens
        if (this.match('NEWLINE')) {
          lastWasNewline = true;
          codeContent.push('\n');
        } else {
          lastWasNewline = false;
          if (this.match('TEXT')) {
            codeContent.push(this.previous().value);
          } else {
            // For any other token, just get its value
            const token = this.advance();
            codeContent.push(token.value);
          }
        }
      }

      const content = codeContent.join('');

      // If we found a proper closing
      if (foundClosing) {
        return {
          type: 'pre',
          value: content.replace(/\n+$/, '').replace(/\r/g, ''), // Trim trailing newlines and remove \r
          attributes: language ? { language } : undefined
        };
      }

      return {
        type: 'text',
        value: '```' + (language ? language + '\n' : '') + content + '```',
      };
    }

    // Handle single backtick inline code
    if (this.match('BACKTICK')) {
      const codeContent: string[] = [];
      let foundClosing = false;

      while (!this.isAtEnd() && !foundClosing) {
        if (this.check('BACKTICK')) {
          foundClosing = true;
          this.advance();
        } else if (this.match('TEXT')) {
          codeContent.push(this.previous().value);
        } else {
          codeContent.push(this.advance().value);
        }
      }

      if (foundClosing) {
        return {
          type: 'code',
          value: codeContent.join('')
        };
      }

      return {
        type: 'text',
        value: '`' + codeContent.join('')
      };
    }

    // Handle all other formatting markers
    const marker = this.getMarkerInfo(this.peek().type);
    if (marker) {
      return this.parseMarkedText(marker);
    }

    // For any other token, just advance and return as text
    if (!this.isAtEnd()) {
      const token = this.advance();
      return {
        type: 'text',
        value: token.value,
      };
    }

    return undefined;
  }

  private parseMarkedText(markerInfo: MarkerInfo): ASTNode {
    // Don't process if this marker is already active (prevents infinite recursion)
    if (this.activeMarkers.has(markerInfo.type)) {
      this.advance();
      return {
        type: 'text',
        value: markerInfo.symbol
      };
    }

    this.advance(); // consume marker
    const children: ASTNode[] = [];
    
    // Add to active markers
    this.activeMarkers.add(markerInfo.type);
    
    // Parse until we find closing marker or EOF
    while (!this.isAtEnd() && !this.check(markerInfo.closing)) {
      const node = this.parseNode();
      if (node) children.push(node);
    }

    // Remove from active markers
    this.activeMarkers.delete(markerInfo.type);

    // If we found closing marker
    if (this.match(markerInfo.closing)) {
      return {
        type: markerInfo.nodeType,
        children
      };
    }

    // No closing marker found, treat as text
    return {
      type: 'text',
      value: markerInfo.symbol + children.map(child => {
        if (child.type === 'text') return child.value;
        const info = this.MARKERS.find(m => m.nodeType === child.type);
        return info ? info.symbol + this.getNodeText(child) + info.symbol : this.getNodeText(child);
      }).join('')
    };
  }

  private getNodeText(node: ASTNode): string {
    if (node.type === 'text') return node.value || '';
    return node.children?.map(child => this.getNodeText(child)).join('') || '';
  }

  parse(): ASTNode {
    const nodes: ASTNode[] = [];
    while (!this.isAtEnd()) {
      const node = this.parseNode();
      if (node) nodes.push(node);
    }
    return { type: 'root', children: nodes };
  }
}
