export type TokenType = 
  | 'TEXT'
  | 'ASTERISK'      // *
  | 'DOUBLE_ASTERISK' // **
  | 'UNDERSCORE'    // _
  | 'DOUBLE_UNDERSCORE' // __
  | 'TILDE'         // ~
  | 'DOUBLE_TILDE'         // ~
  | 'BACKTICK'      // `
  | 'DOUBLE_BACKTICK' // ``
  | 'TRIPLE_BACKTICK' // ```
  | 'TRIPLE_BACKTICK_INLINE'  // For triple backticks not at start of line
  | 'DOUBLE_PIPE'   // ||
  | 'GT'            // >
  | 'DOUBLE_GT'     // **
  | 'NEWLINE'       // \n
  | 'BRACKET_OPEN'  // [
  | 'BRACKET_CLOSE' // ]
  | 'PAREN_OPEN'    // (
  | 'PAREN_CLOSE'   // )
  | 'EOF';          // End of file

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export type NodeType = 
  | 'root'
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'spoiler'
  | 'code'
  | 'pre'
  | 'blockquote'
  | 'expandableBlockquote';

export interface ASTNode {
  type: NodeType;
  value?: string;
  children?: ASTNode[];
  attributes?: Record<string, string>;
}
