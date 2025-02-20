import { ASTNode } from './types';
import { ApiMessageEntityTypes } from '../../api/types';

export class Generator {
  generate(node: ASTNode): string {
    switch (node.type) {
      case 'root':
        return this.generateChildren(node);

      case 'text':
        return node.value || '';

      case 'bold':
        return `<b data-entity-type="${ApiMessageEntityTypes.Bold}">${this.generateChildren(node)}</b>`;

      case 'italic':
        return `<i data-entity-type="${ApiMessageEntityTypes.Italic}">${this.generateChildren(node)}</i>`;

      case 'underline':
        return `<u data-entity-type="${ApiMessageEntityTypes.Underline}">${this.generateChildren(node)}</u>`;

      case 'strike':
        return `<s data-entity-type="${ApiMessageEntityTypes.Strike}">${this.generateChildren(node)}</s>`;

      case 'spoiler':
        return `<span class="spoiler" data-entity-type="${ApiMessageEntityTypes.Spoiler}">${this.generateChildren(node)}</span>`;

      case 'code': {
        // Inline code
        return `<code>${escapeHtml(node.value)}</code>`;
      }

      case 'pre': {
        const { value, attributes } = node;
        const language = attributes?.language;
        
        // Three cases:
        // 1. Inline code: just <code>
        // 2. Code block without language: <pre>
        // 3. Code block with language: <pre data-language="X"><code class="language-X">
        
        if (language) {
          // Code block with language
          return `<pre data-language="${language}"><code class="language-${language}">${escapeHtml(value)}</code></pre>`;
        } else {
          // Code block without language
          return `<pre><code>${escapeHtml(value)}</code></pre>`;
        }
      }

      case 'blockquote':
        return `<blockquote class="text-entity-quote" dir="auto" data-entity-type="${ApiMessageEntityTypes.Blockquote}">${this.generateChildren(node)}</blockquote>`;

      case 'expandableBlockquote':
        return `<blockquote class="text-entity-quote" dir="auto" data-entity-type="${ApiMessageEntityTypes.Blockquote}" expandable>${this.generateChildren(node)}</blockquote>`;

      default:
        return '';
    }
  }

  private generateChildren(node: ASTNode): string {
    if (!node.children) return '';
    return node.children.map(child => this.generate(child)).join('');
  }
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
