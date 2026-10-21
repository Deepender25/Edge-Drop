/**
 * codeDetect.ts — Fast heuristic syntax and language detection for clipboard text.
 */

export interface CodeDetectionResult {
  isCode: boolean
  language: string
  displayName: string
}

export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  tsx: 'TSX',
  typescript: 'TypeScript',
  jsx: 'JSX',
  javascript: 'JavaScript',
  json: 'JSON',
  css: 'CSS',
  html: 'HTML',
  python: 'Python',
  bash: 'Bash',
  sql: 'SQL',
  rust: 'Rust',
  go: 'Go',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  yaml: 'YAML',
  markdown: 'Markdown',
  graphql: 'GraphQL',
}

/**
 * Detects if a given text string is a code snippet, and infers its programming language.
 */
export function detectCode(raw: string): CodeDetectionResult {
  if (!raw || typeof raw !== 'string') {
    return { isCode: false, language: 'text', displayName: 'Text' }
  }

  const text = raw.trim()

  // Ignore very short single tokens (like "hello" or numbers)
  if (text.length < 4) {
    return { isCode: false, language: 'text', displayName: 'Text' }
  }

  // 1. JSON Detection
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      JSON.parse(text)
      // Check if it's a multi-line or formatted JSON object/array
      if (text.includes(':') || text.includes('\n') || text.length > 20) {
        return { isCode: true, language: 'json', displayName: 'JSON' }
      }
    } catch {
      // If it looks like JSON structure with quotes and colons
      if (/^\{[\s\S]*"[a-zA-Z0-9_$-]+"\s*:[\s\S]*\}$/.test(text)) {
        return { isCode: true, language: 'json', displayName: 'JSON' }
      }
    }
  }

  // A script module that returns markup (React components and the like):
  // it starts as code, not as a tag, so the HTML rule below must not win.
  const looksLikeScript = !text.startsWith('<') &&
    /(?:^|\n)\s*(import\s[^\n]*?\bfrom\s+['"]|export\s+(default|const|function|class)\b|(const|let|var)\s+([\w$]+\s*(:[^=\n]+)?=[^=]|[{[])|function\s+[\w$]+\s*\()/.test(text)

  // 2. HTML / XML / SVG Detection
  if (!looksLikeScript && (
    /<!DOCTYPE\s+html/i.test(text) ||
    /<(html|head|body|div|span|p|a|svg|script|style|path|button|input|h[1-6]|table|form|ul|li|section|header|footer|template)\b[^>]*>/i.test(text) ||
    (text.startsWith('<') && text.endsWith('>') && /<\/?[a-z][a-z0-9-]*\b/i.test(text))
  )) {
    return { isCode: true, language: 'html', displayName: 'HTML' }
  }

  // 3. CSS / SCSS Detection
  if (
    /@(media|keyframes|import|supports|font-face|container)\b/.test(text) ||
    /:(root|hover|focus|active|before|after|nth-child)\b/.test(text) ||
    /(?:^|\n)\s*([.#]?[a-zA-Z0-9_#-]+(\s*,\s*[.#]?[a-zA-Z0-9_#-]+)*)\s*\{\s*[\n\r]?(?:\s*[a-zA-Z-]+:\s*[^;]+;\s*[\n\r]?)+\}/.test(text) ||
    /(\b(color|background|padding|margin|display|flex|font-size|border|width|height|opacity|z-index|transform|box-shadow|overflow|position)\s*:\s*[^;]+;)/.test(text)
  ) {
    // If it has CSS properties and brackets/colons
    if (text.includes('{') && text.includes('}') && text.includes(':')) {
      return { isCode: true, language: 'css', displayName: 'CSS' }
    }
  }

  // 4. SQL Detection
  if (
    /^\s*(SELECT\s+[\s\S]+?\s+FROM\s+|INSERT\s+INTO\s+|UPDATE\s+[\s\S]+?\s+SET\s+|DELETE\s+FROM\s+|CREATE\s+(TABLE|INDEX|VIEW|DATABASE)\s+|ALTER\s+TABLE\s+|DROP\s+(TABLE|DATABASE)\s+|WITH\s+\w+\s+AS\s*\()/i.test(text)
  ) {
    return { isCode: true, language: 'sql', displayName: 'SQL' }
  }

  // 5. Bash / Shell Script / Terminal Commands
  if (
    /^#!\/bin\/(bash|sh|zsh)/.test(text) ||
    /^\s*(npm|pnpm|yarn|bun|git|curl|docker|sudo|brew|npx|apt-get|systemctl|cargo|cargo-build|pip|pip3|pytest|vitest)\s+[a-zA-Z0-9_./:-]+/m.test(text) ||
    /^\s*(export\s+[A-Z0-9_]+=|chmod\s+\+?[0-9xrw]+|mkdir\s+-p|rm\s+-rf|grep\s+-)/m.test(text)
  ) {
    return { isCode: true, language: 'bash', displayName: 'Bash' }
  }

  // 6. Python Detection
  if (
    /(?:^|\n)\s*def\s+[a-zA-Z_]\w*\s*\(.*?\)\s*(?:->\s*[^:]+)?\s*:/m.test(text) ||
    /(?:^|\n)\s*class\s+[a-zA-Z_]\w*(?:\(.*?\))?\s*:/m.test(text) ||
    /(?:^|\n)\s*from\s+[a-zA-Z_.]+\s+import\s+/m.test(text) ||
    /(?:^|\n)\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m.test(text) ||
    /(?:^|\n)\s*elif\s+[^:]+:/m.test(text) ||
    /\bprint\(.*?\)/m.test(text) && /\b(self|elif|import|None|True|False)\b/.test(text)
  ) {
    return { isCode: true, language: 'python', displayName: 'Python' }
  }

  // 7. Rust Detection
  if (
    /\bfn\s+[a-zA-Z_]\w*\s*\(.*?\)\s*(?:->\s*[^\{]+)?\s*\{/.test(text) ||
    /\b(let\s+mut\s+|impl\s+[A-Z]\w*|pub\s+struct\s+[A-Z]\w*|use\s+std::|match\s+\w+\s*\{|println!\()/.test(text)
  ) {
    return { isCode: true, language: 'rust', displayName: 'Rust' }
  }

  // 8. Go Detection
  if (
    /\bpackage\s+[a-zA-Z_]\w*/.test(text) ||
    /\bfunc\s+(?:\([a-zA-Z0-9_* ]+\)\s+)?[a-zA-Z_]\w*\(.*?\)/.test(text) ||
    /\b(import\s*\(\s*[\r\n]+|fmt\.Print|go\s+func\(\))/.test(text)
  ) {
    return { isCode: true, language: 'go', displayName: 'Go' }
  }

  // 9. C / C++ / C#
  if (
    /#include\s+<[a-zA-Z0-9_.]+>/.test(text) ||
    /\bstd::(cout|cin|vector|string|make_unique|make_shared)\b/.test(text) ||
    /\bint\s+main\s*\([^)]*\)\s*\{/.test(text)
  ) {
    return { isCode: true, language: 'cpp', displayName: 'C++' }
  }

  if (
    /\busing\s+System(\.[A-Za-z0-9_]+)*;/.test(text) ||
    /\bnamespace\s+[A-Za-z0-9_.]+\s*\{/.test(text) ||
    /\b(public|private|protected)\s+(class|interface|enum|struct|async\s+Task)\s+[A-Za-z0-9_]+/.test(text)
  ) {
    return { isCode: true, language: 'csharp', displayName: 'C#' }
  }

  // 10. TypeScript / TSX / JavaScript / JSX
  const hasTsTypes = /:\s*(string|number|boolean|any|void|unknown|never|Record<|Array<|Promise<|React\.[A-Za-z]+)\b/.test(text) ||
    /\b(interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=|as\s+const\b|<[A-Z]\w*>\s*\()/.test(text)
  const hasJsx = /<[A-Z][a-zA-Z0-9]*\b[^>]*(\/?>|>[\s\S]*?<\/[A-Z][a-zA-Z0-9]*>)/.test(text) ||
    /<>\s*[\s\S]*?<\/>/.test(text) ||
    /\bclassName=/.test(text) ||
    // lowercase tags count only as markup, not inside a string or regex
    (looksLikeScript && /(^|[^'"`/\w])<[a-z][a-z0-9-]*\b[^<>]*>/.test(text))

  const hasJsKeywords = /\b(import\s+.*?from\s+['"]|export\s+(default\s+|const\s+|function\s+|class\s+)|const\s+[a-zA-Z0-9_$]+(\s*:\s*[^=]+)?\s*=|let\s+[a-zA-Z0-9_$]+(\s*:\s*[^=]+)?\s*=|function\s+[a-zA-Z0-9_$]+\s*\(|console\.(log|error|warn|info)|async\s+function|await\s+[a-zA-Z0-9_$]+|=>\s*[\{\(])/.test(text)

  if (hasJsKeywords || hasJsx || hasTsTypes || looksLikeScript) {
    if (hasJsx) {
      return {
        isCode: true,
        language: hasTsTypes ? 'tsx' : 'jsx',
        displayName: hasTsTypes ? 'TSX' : 'JSX'
      }
    }
    if (hasTsTypes) {
      return { isCode: true, language: 'typescript', displayName: 'TypeScript' }
    }
    return { isCode: true, language: 'javascript', displayName: 'JavaScript' }
  }

  // 11. General Code Heuristics (e.g. multi-line structured block with brackets and operators)
  const lines = text.split('\n')
  if (lines.length >= 2) {
    let codeScore = 0
    if (/[{}\[\]();]/.test(text)) codeScore += 2
    if (/===|!==|=>|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|::|->/.test(text)) codeScore += 2
    if (/^\s{2,}|\t/m.test(text)) codeScore += 2
    if (/\b(return|if|else|for|while|switch|case|break|try|catch|throw|new|typeof|instanceof)\b/.test(text)) codeScore += 3
    if (/\b(true|false|null|undefined|NaN)\b/.test(text)) codeScore += 1
    if (/(\/\/|#|\/\*|\*\/)/.test(text)) codeScore += 1

    if (codeScore >= 5) {
      return { isCode: true, language: 'javascript', displayName: 'Code' }
    }
  }

  return { isCode: false, language: 'text', displayName: 'Text' }
}
