import type { ApiFormattedText, ApiMessageEntity } from '../api/types';
import { ApiMessageEntityTypes } from '../api/types';

import { RE_LINK_TEMPLATE } from '../config';
import { IS_EMOJI_SUPPORTED } from './windowEnvironment';
import { parseMarkdown } from './markdown';

export const ENTITY_CLASS_BY_NODE_NAME: Record<string, ApiMessageEntityTypes> = {
  B: ApiMessageEntityTypes.Bold,
  STRONG: ApiMessageEntityTypes.Bold,
  I: ApiMessageEntityTypes.Italic,
  EM: ApiMessageEntityTypes.Italic,
  INS: ApiMessageEntityTypes.Underline,
  U: ApiMessageEntityTypes.Underline,
  S: ApiMessageEntityTypes.Strike,
  STRIKE: ApiMessageEntityTypes.Strike,
  DEL: ApiMessageEntityTypes.Strike,
  CODE: ApiMessageEntityTypes.Code,
  PRE: ApiMessageEntityTypes.Pre,
  BLOCKQUOTE: ApiMessageEntityTypes.Blockquote,
};

const MAX_TAG_DEEPNESS = 3;

export default function parseHtmlAsFormattedText(
  html: string, withMarkdownLinks = true, skipMarkdown = false,
): ApiFormattedText {
  const fragment = document.createElement('div');
  fragment.innerHTML = skipMarkdown ? html
    : withMarkdownLinks ? parseMarkdown(parseMarkdownLinks(html)) : parseMarkdown(html);
  fixImageContent(fragment);
  const text = fragment.innerText.trim().replace(/\u200b+/g, '');
  const trimShift = fragment.innerText.indexOf(text[0]);
  let textIndex = -trimShift;
  let recursionDeepness = 0;
  const entities: ApiMessageEntity[] = [];

  function addEntity(node: ChildNode) {
    if (node.nodeType === Node.COMMENT_NODE) return;
    const { index, entity } = getEntityDataFromNode(node, text, textIndex);

    if (entity) {
      textIndex = index;
      entities.push(entity);
    } else if (node.textContent) {
      // Skip newlines on the beginning
      if (index === 0 && node.textContent.trim() === '') {
        return;
      }
      textIndex += node.textContent.length;
    }

    if (node.hasChildNodes() && recursionDeepness <= MAX_TAG_DEEPNESS) {
      recursionDeepness += 1;
      Array.from(node.childNodes).forEach(addEntity);
    }
  }

  Array.from(fragment.childNodes).forEach((node) => {
    recursionDeepness = 1;
    addEntity(node);
  });

  return {
    text,
    entities: entities.length ? entities : undefined,
  };
}

export function fixImageContent(fragment: HTMLDivElement) {
  fragment.querySelectorAll('img').forEach((node) => {
    if (node.dataset.documentId) { // Custom Emoji
      node.textContent = (node as HTMLImageElement).alt || '';
    } else { // Regular emoji with image fallback
      node.replaceWith(node.alt || '');
    }
  });
}

function parseMarkdownLegacy(html: string) {
  let parsedHtml = html.slice(0);

  // Strip redundant nbsp's
  parsedHtml = parsedHtml.replace(/&nbsp;/g, ' ');

  // Handle escaped characters (should be processed before any other markdown)
  // This handles any character with code between 1 and 126 and special markdown characters
  parsedHtml = parsedHtml.replace(/\\([1-~]|[_*[\]()~`>#+=\-|{}.!])/g, (match, char) => {
    // Store the ASCII code as a temporary placeholder to avoid it being processed as markdown
    return `\uE000${char.charCodeAt(0)}\uE001`;
  });

  // Replace <div><br></div> with newline (new line in Safari)
  parsedHtml = parsedHtml.replace(/<div><br([^>]*)?><\/div>/g, '\n');
  // Replace <br> with newline
  parsedHtml = parsedHtml.replace(/<br([^>]*)?>/g, '\n');

  // Strip redundant <div> tags
  parsedHtml = parsedHtml.replace(/<\/div>(\s*)<div>/g, '\n');
  parsedHtml = parsedHtml.replace(/<div>/g, '\n');
  parsedHtml = parsedHtml.replace(/<\/div>/g, '');

  // Pre
  parsedHtml = parsedHtml.replace(/^`{3}(.*?)[\n\r](.*?[\n\r]?)`{3}/gms, '<pre data-language="$1">$2</pre>');
  parsedHtml = parsedHtml.replace(/^`{3}[\n\r]?(.*?)[\n\r]?`{3}/gms, '<pre>$1</pre>');
  parsedHtml = parsedHtml.replace(/[`]{3}([^`]+)[`]{3}/g, '<pre>$1</pre>');

  // Code
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[`]{1}([^`\n]+)[`]{1}(?![^<]*<\/(code|pre)>)/g,
    '<code>$2</code>',
  );

  // Custom Emoji markdown tag
  if (!IS_EMOJI_SUPPORTED) {
    // Prepare alt text for custom emoji
    parsedHtml = parsedHtml.replace(/\[<img[^>]+alt="([^"]+)"[^>]*>]/gm, '[$1]');
  }
  parsedHtml = parsedHtml.replace(
    /(?!<(?:code|pre)[^<]*|<\/)\[([^\]\n]+)\]\(customEmoji:(\d+)\)(?![^<]*<\/(?:code|pre)>)/g,
    '<img alt="$1" data-document-id="$2">',
  );

  // Bold
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[*]{2}([^*\n]+)[*]{2}(?![^<]*<\/(code|pre)>)/g,
    '<b>$2</b>',
  );
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[*]([^*\n]+)[*](?![^<]*<\/(code|pre)>)/g,
    '<b>$2</b>',
  );

  // Handle triple underscore with disambiguation
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[_]{3}([^_\n]+)[_]{3}[*]{2}[_](?![^<]*<\/(code|pre)>)/g,
    '<i><u>$2</u></i><b></b>',
  );

  // Underline (handle before italic to ensure greedy matching)
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[_]{2}([^_\n]+)[_]{2}(?![^<]*<\/(code|pre)>)/g,
    '<u>$2</u>',
  );

  // Italic (single underscore)
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[_]([^_\n]+)[_](?![^<]*<\/(code|pre)>)/g,
    '<i>$2</i>',
  );

  // Strikethrough (single tilde)
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[~]([^~\n]+)[~](?![^<]*<\/(code|pre)>)/g,
    '<s>$2</s>',
  );

  // Spoiler
  parsedHtml = parsedHtml.replace(
    /(?!<(code|pre)[^<]*|<\/)[|]{2}([^|\n]+)[|]{2}(?![^<]*<\/(code|pre)>)/g,
    `<span data-entity-type="${ApiMessageEntityTypes.Spoiler}">$2</span>`,
  );

  // Blockquote - collect consecutive lines
  parsedHtml = parsedHtml.replace(
    /(?:^|\n)(?:&gt;[ ]?.*(?:\n|$))+/g,
    (match) => {
      const content = match
        .split('\n')
        .map(line => line.trim().replace(/^&gt;[ ]?/, ''))
        .filter(Boolean)
        .join('\n');
      return `\n<blockquote class="text-entity-quote" dir="auto">${content}</blockquote>\n`;
    }
  );

  // Restore escaped characters
  parsedHtml = parsedHtml.replace(/\uE000(\d+)\uE001/g, (match, charCode) => {
    return String.fromCharCode(Number(charCode));
  });

  return parsedHtml;
}

function parseMarkdownLinks(html: string) {
  // Handle inline URLs with format [text](url)
  return html.replace(
    // Support both http(s) and non-protocol URLs
    new RegExp(`\\[([^\\]]+?)]\\(((?:${RE_LINK_TEMPLATE}|[^\\s<>\\[\\]()]+?))\\)`, 'g'),
    (_, text, link) => {
      // Ensure proper URL formatting
      const url = ensureProtocol(link);
      // Escape any HTML in the text content
      const safeText = text.replace(/[<>&"']/g, (char: any) => {
        switch (char) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          default: return char;
        }
      });
      return `<a href="${url}" data-entity-type="${ApiMessageEntityTypes.TextUrl}">${safeText}</a>`;
    }
  );
}

function getEntityDataFromNode(
  node: ChildNode,
  rawText: string,
  textIndex: number,
): { index: number; entity?: ApiMessageEntity } {
  const type = getEntityTypeFromNode(node);

  if (!type || !node.textContent) {
    return {
      index: textIndex,
      entity: undefined,
    };
  }

  const rawIndex = rawText.indexOf(node.textContent, textIndex);
  // In some cases, last text entity ends with a newline (which gets trimmed from `rawText`).
  // In this case, `rawIndex` would return `-1`, so we use `textIndex` instead.
  const index = rawIndex >= 0 ? rawIndex : textIndex;
  const offset = rawText.substring(0, index).length;
  const { length } = rawText.substring(index, index + node.textContent.length);

  if (type === ApiMessageEntityTypes.TextUrl) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        url: (node as HTMLAnchorElement).href,
      },
    };
  }
  if (type === ApiMessageEntityTypes.MentionName) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        userId: (node as HTMLAnchorElement).dataset.userId!,
      },
    };
  }

  if (type === ApiMessageEntityTypes.Pre) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        language: (node as HTMLPreElement).dataset.language,
      },
    };
  }

  if (type === ApiMessageEntityTypes.CustomEmoji) {
    return {
      index,
      entity: {
        type,
        offset,
        length,
        documentId: (node as HTMLImageElement).dataset.documentId!,
      },
    };
  }

  return {
    index,
    entity: {
      type,
      offset,
      length,
    },
  };
}

function getEntityTypeFromNode(node: ChildNode): ApiMessageEntityTypes | undefined {
  if (node instanceof HTMLElement && node.dataset.entityType) {
    return node.dataset.entityType as ApiMessageEntityTypes;
  }

  if (ENTITY_CLASS_BY_NODE_NAME[node.nodeName]) {
    return ENTITY_CLASS_BY_NODE_NAME[node.nodeName];
  }

  if (node.nodeName === 'A') {
    const anchor = node as HTMLAnchorElement;
    if (anchor.dataset.entityType === ApiMessageEntityTypes.MentionName) {
      return ApiMessageEntityTypes.MentionName;
    }
    if (anchor.dataset.entityType === ApiMessageEntityTypes.Url) {
      return ApiMessageEntityTypes.Url;
    }
    if (anchor.href.startsWith('mailto:')) {
      return ApiMessageEntityTypes.Email;
    }
    if (anchor.href.startsWith('tel:')) {
      return ApiMessageEntityTypes.Phone;
    }
    if (anchor.href !== anchor.textContent) {
      return ApiMessageEntityTypes.TextUrl;
    }

    return ApiMessageEntityTypes.Url;
  }

  if (node.nodeName === 'SPAN') {
    return (node as HTMLElement).dataset.entityType as any;
  }

  if (node.nodeName === 'IMG') {
    if ((node as HTMLImageElement).dataset.documentId) {
      return ApiMessageEntityTypes.CustomEmoji;
    }
  }

  return undefined;
}

function ensureProtocol(link: string) {
  if (link.includes('://')) {
    return link;
  }
  if (link.includes('@')) {
    return `mailto:${link}`;
  }
  return `https://${link}`;
}
