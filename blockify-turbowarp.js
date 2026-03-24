// BLOCKIFY PHASE 1 PROTOTYPE — TURBOWARP CUSTOM EXTENSION
// Strict Textify IR consumer for the current proven grammar.
// Scope:
// - procedure
// - script
// - stack
// - opcode
// - literal
// - menu
// Rules:
// - stack order = execution order
// - missing SUBSTACK / SUBSTACK2 = empty stack for supported control opcodes only
// - opcode identity = id
// - fail loudly on malformed canon

(function (Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Blockify Phase 1 must be loaded unsandboxed.');
  }

  class ParseError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ParseError';
    }
  }

  class ValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ValidationError';
    }
  }

  function indentStr(level) {
    return '  '.repeat(level);
  }

  class Parser {
    constructor(text) {
      this.text = String(text || '');
      this.i = 0;
      this.n = this.text.length;
    }

    parse() {
      this.skipWS();
      const node = this.parseBracketNode();
      this.skipWS();
      if (this.i !== this.n) {
        throw new ParseError(`Unexpected trailing content at index ${this.i}`);
      }
      if (!node || (node.type !== 'procedure' && node.type !== 'script')) {
        throw new ValidationError('Root node must be procedure or script');
      }
      this.validateRoot(node);
      return node;
    }

    peek(s) {
      return this.text.startsWith(s, this.i);
    }

    expect(s) {
      if (!this.peek(s)) {
        const snippet = this.text.slice(this.i, this.i + 40);
        throw new ParseError(`Expected ${JSON.stringify(s)} at index ${this.i}, found ${JSON.stringify(snippet)}`);
      }
      this.i += s.length;
    }

    skipWS() {
      while (this.i < this.n && /\s/.test(this.text[this.i])) {
        this.i += 1;
      }
    }

    parseIdentifier() {
      this.skipWS();
      const start = this.i;
      while (this.i < this.n && /[A-Za-z0-9_./-]/.test(this.text[this.i])) {
        this.i += 1;
      }
      if (start === this.i) {
        throw new ParseError(`Expected identifier at index ${this.i}`);
      }
      return this.text.slice(start, this.i);
    }

    parseString() {
      this.skipWS();
      this.expect('"');
      let out = '';
      while (this.i < this.n) {
        const ch = this.text[this.i];
        if (ch === '"') {
          this.i += 1;
          return out;
        }
        if (ch === '\\') {
          this.i += 1;
          if (this.i >= this.n) {
            throw new ParseError('Unterminated escape in string');
          }
          const esc = this.text[this.i];
          const mapping = {
            n: '\n',
            r: '\r',
            t: '\t',
            '"': '"',
            '\\': '\\'
          };
          out += Object.prototype.hasOwnProperty.call(mapping, esc) ? mapping[esc] : esc;
          this.i += 1;
          continue;
        }
        out += ch;
        this.i += 1;
      }
      throw new ParseError('Unterminated quoted string');
    }

    parseBool() {
      this.skipWS();
      if (this.peek('true')) {
        this.i += 4;
        return true;
      }
      if (this.peek('false')) {
        this.i += 5;
        return false;
      }
      throw new ParseError(`Invalid boolean token at index ${this.i}`);
    }

    parseNumber() {
      this.skipWS();
      const start = this.i;
      if (this.i < this.n && /[+-]/.test(this.text[this.i])) {
        this.i += 1;
      }
      let sawDigit = false;
      while (this.i < this.n && /\d/.test(this.text[this.i])) {
        sawDigit = true;
        this.i += 1;
      }
      if (this.i < this.n && this.text[this.i] === '.') {
        this.i += 1;
        while (this.i < this.n && /\d/.test(this.text[this.i])) {
          sawDigit = true;
          this.i += 1;
        }
      }
      if (!sawDigit) {
        throw new ParseError(`Invalid number token at index ${start}`);
      }
      const token = this.text.slice(start, this.i);
      const value = Number(token);
      if (Number.isNaN(value)) {
        throw new ParseError(`Invalid number token ${JSON.stringify(token)}`);
      }
      return value;
    }

    ensureUniqueKey(out, key, mapName) {
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        throw new ValidationError(`Duplicate key "${key}" in ${mapName} map`);
      }
    }

    parseStringArray() {
      this.skipWS();
      this.expect('[');
      this.skipWS();
      const items = [];
      if (this.peek(']')) {
        this.i += 1;
        return items;
      }
      while (true) {
        items.push(this.parseString());
        this.skipWS();
        if (this.peek(',')) {
          this.i += 1;
          this.skipWS();
          continue;
        }
        this.expect(']');
        return items;
      }
    }

    parseFieldMap() {
      this.skipWS();
      this.expect('{');
      this.skipWS();
      const out = Object.create(null);
      if (this.peek('}')) {
        this.i += 1;
        return out;
      }
      while (true) {
        const key = this.parseIdentifier();
        this.ensureUniqueKey(out, key, 'fields');
        this.skipWS();
        this.expect(':');
        const value = this.parseString();
        out[key] = value;
        this.skipWS();
        if (this.peek('}')) {
          this.i += 1;
          return out;
        }
      }
    }

    parseInputsMap() {
      this.skipWS();
      this.expect('{');
      this.skipWS();
      const out = Object.create(null);
      if (this.peek('}')) {
        this.i += 1;
        return out;
      }
      while (true) {
        const key = this.parseIdentifier();
        this.ensureUniqueKey(out, key, 'inputs');
        this.skipWS();
        this.expect(':');
        const value = this.parseBracketNode();
        if (value.type === 'stack' || value.type === 'procedure') {
          throw new ValidationError(`Input ${key} contains invalid node type ${value.type}`);
        }
        out[key] = value;
        this.skipWS();
        if (this.peek('}')) {
          this.i += 1;
          return out;
        }
      }
    }

    parseStacksMap() {
      this.skipWS();
      this.expect('{');
      this.skipWS();
      const out = Object.create(null);
      if (this.peek('}')) {
        this.i += 1;
        return out;
      }
      while (true) {
        const key = this.parseIdentifier();
        this.ensureUniqueKey(out, key, 'stacks');
        this.skipWS();
        this.expect(':');
        const value = this.parseBracketNode();
        if (value.type !== 'stack') {
          throw new ValidationError(`Stack slot ${key} contains non-stack node`);
        }
        out[key] = value;
        this.skipWS();
        if (this.peek('}')) {
          this.i += 1;
          return out;
        }
      }
    }

    parseBracketNode() {
      this.skipWS();
      this.expect('[');
      const nodeType = this.parseIdentifier();
      let node;

      if (nodeType === 'procedure') {
        node = this.parseProcedureBody();
      } else if (nodeType === 'script') {
        node = this.parseScriptBody();
      } else if (nodeType === 'stack') {
        this.skipWS();
        this.expect(':');
        node = this.parseStackBody();
      } else if (nodeType === 'opcode') {
        this.skipWS();
        this.expect(':');
        const opcode = this.readUntilOpcodeBreak().trim();
        node = this.parseOpcodeBody(opcode);
      } else if (nodeType === 'literal') {
        this.skipWS();
        this.expect(':');
        node = this.parseLiteralBody();
      } else if (nodeType === 'menu') {
        this.skipWS();
        this.expect(':');
        const menuOpcode = this.parseIdentifier();
        this.skipWS();
        this.expect(':');
        const value = this.parseString();
        node = {
          type: 'menu',
          menuOpcode,
          value
        };
      } else {
        throw new ParseError(`Unknown bracket node type ${JSON.stringify(nodeType)} at index ${this.i}`);
      }

      this.skipWS();
      this.expect(']');
      return node;
    }

    readUntilOpcodeBreak() {
      const start = this.i;
      while (this.i < this.n) {
        const ch = this.text[this.i];
        if (ch === '\n' || ch === '\r' || ch === ']') {
          break;
        }
        this.i += 1;
      }
      return this.text.slice(start, this.i);
    }

    parseProcedureBody() {
      let proccode = null;
      let argumentnames = null;
      let argumentdefaults = null;
      let warp = false;
      let body = null;

      while (true) {
        this.skipWS();
        if (this.peek(']')) break;
        const key = this.parseIdentifier();
        this.skipWS();
        this.expect(':');

        if (key === 'proccode') {
          proccode = this.parseString();
        } else if (key === 'argumentnames') {
          argumentnames = this.parseStringArray();
        } else if (key === 'argumentdefaults') {
          argumentdefaults = this.parseStringArray();
        } else if (key === 'warp') {
          warp = this.parseBool();
        } else if (key === 'body') {
          const value = this.parseBracketNode();
          if (value.type !== 'stack') {
            throw new ValidationError('body must be a stack node');
          }
          body = value;
        } else {
          throw new ParseError(`Unknown procedure property ${JSON.stringify(key)}`);
        }
      }

      if (proccode === null) throw new ValidationError('Missing proccode');
      if (argumentnames === null) throw new ValidationError('Missing argumentnames');
      if (argumentdefaults === null) throw new ValidationError('Missing argumentdefaults');
      if (body === null) throw new ValidationError('Missing body');

      return {
        type: 'procedure',
        proccode,
        argumentnames,
        argumentdefaults,
        warp,
        body
      };
    }

    parseScriptBody() {
      let body = null;

      while (true) {
        this.skipWS();
        if (this.peek(']')) break;
        const key = this.parseIdentifier();
        this.skipWS();
        this.expect(':');

        if (key === 'body') {
          const value = this.parseBracketNode();
          if (value.type !== 'stack') {
            throw new ValidationError('body must be a stack node');
          }
          body = value;
        } else {
          throw new ParseError(`Unknown script property ${JSON.stringify(key)}`);
        }
      }

      if (body === null) throw new ValidationError('Missing body');

      return {
        type: 'script',
        body
      };
    }

    parseStackBody() {
      const children = [];
      while (true) {
        this.skipWS();
        if (this.peek(']')) break;
        const child = this.parseBracketNode();
        if (child.type !== 'opcode') {
          throw new ValidationError('Stack contains non-opcode child');
        }
        children.push(child);
      }
      return {
        type: 'stack',
        children
      };
    }

    parseOpcodeBody(opcode) {
      let id = null;
      let fields = Object.create(null);
      let inputs = Object.create(null);
      let stacks = Object.create(null);

      while (true) {
        this.skipWS();
        if (this.peek(']')) break;
        const key = this.parseIdentifier();
        this.skipWS();
        this.expect(':');

        if (key === 'id') {
          id = this.parseString();
        } else if (key === 'fields') {
          fields = this.parseFieldMap();
        } else if (key === 'inputs') {
          inputs = this.parseInputsMap();
        } else if (key === 'stacks') {
          stacks = this.parseStacksMap();
        } else {
          throw new ParseError(`Unknown opcode property ${JSON.stringify(key)} for ${opcode}`);
        }
      }

      if (!opcode) {
        throw new ValidationError('Missing opcode');
      }
      if (id === null) {
        throw new ValidationError(`Missing id for opcode ${opcode}`);
      }

      const expectedStackSlots = {
        control_if: ['SUBSTACK'],
        control_if_else: ['SUBSTACK', 'SUBSTACK2'],
        control_repeat: ['SUBSTACK'],
        control_repeat_until: ['SUBSTACK'],
        control_forever: ['SUBSTACK'],
        control_while: ['SUBSTACK']
      }[opcode] || [];

      for (const slot of expectedStackSlots) {
        if (!Object.prototype.hasOwnProperty.call(stacks, slot)) {
          stacks[slot] = { type: 'stack', children: [] };
        }
      }

      return {
        type: 'opcode',
        opcode,
        id,
        fields,
        inputs,
        stacks
      };
    }

    parseLiteralBody() {
      const valueType = this.parseIdentifier();
      this.skipWS();
      this.expect(':');
      let value;
      if (valueType === 'number') {
        value = this.parseNumber();
      } else if (valueType === 'string') {
        value = this.parseString();
      } else if (valueType === 'boolean') {
        value = this.parseBool();
      } else {
        throw new ValidationError(`Unknown literal type ${JSON.stringify(valueType)}`);
      }
      return {
        type: 'literal',
        valueType,
        value
      };
    }

    validateRoot(root) {
      const seen = new Set();

      const walkOpcode = node => {
        if (seen.has(node.id)) {
          throw new ValidationError(`Duplicate identity collision inside one procedure: ${node.id}`);
        }
        seen.add(node.id);

        for (const key of Object.keys(node.inputs)) {
          const value = node.inputs[key];
          if (value.type === 'stack' || value.type === 'procedure') {
            throw new ValidationError(`Input ${key} contains invalid node type ${value.type}`);
          }
          if (value.type === 'menu') {
            continue;
          }
          if (value.type === 'opcode') {
            walkOpcode(value);
            continue;
          }
          if (value.type !== 'literal') {
            throw new ValidationError(`Input ${key} contains unsupported node type ${value.type}`);
          }
        }

        for (const key of Object.keys(node.stacks)) {
          const stack = node.stacks[key];
          if (stack.type !== 'stack') {
            throw new ValidationError(`Invalid stack node at ${key}`);
          }
          for (const child of stack.children) {
            if (child.type !== 'opcode') {
              throw new ValidationError('Stack contains non-opcode child');
            }
            walkOpcode(child);
          }
        }
      };

      for (const child of root.body.children) {
        walkOpcode(child);
      }
    }
  }

  class Renderer {
    static renderProcedure(node) {
      if (node.type === 'script') {
        const lines = [];
        lines.push('SCRIPT');
        lines.push('  BODY');
        Renderer.renderStack(node.body, lines, '    ');
        return lines.join('\n');
      }

      const lines = [];
      lines.push(`PROCEDURE ${JSON.stringify(node.proccode)}`);
      lines.push(`  warp: ${String(node.warp)}`);
      lines.push(`  argumentnames: ${JSON.stringify(node.argumentnames)}`);
      lines.push(`  argumentdefaults: ${JSON.stringify(node.argumentdefaults)}`);
      lines.push('  BODY');
      Renderer.renderStack(node.body, lines, '    ');
      return lines.join('\n');
    }

    static renderStack(stack, lines, indent) {
      if (!stack.children.length) {
        lines.push(`${indent}[empty stack]`);
        return;
      }
      for (let idx = 0; idx < stack.children.length; idx++) {
        const child = stack.children[idx];
        lines.push(`${indent}${idx + 1}. ${child.opcode} id=${JSON.stringify(child.id)}`);

        for (const key of Object.keys(child.fields)) {
          lines.push(`${indent}   field ${key} = ${JSON.stringify(child.fields[key])}`);
        }

        for (const key of Object.keys(child.inputs)) {
          lines.push(`${indent}   input ${key} =`);
          Renderer.renderInput(child.inputs[key], lines, `${indent}      `);
        }

        for (const key of Object.keys(child.stacks)) {
          lines.push(`${indent}   stack ${key}:`);
          Renderer.renderStack(child.stacks[key], lines, `${indent}      `);
        }
      }
    }

    static renderInput(value, lines, indent) {
      if (value.type === 'menu') {
        lines.push(`${indent}menu:${value.menuOpcode}:${JSON.stringify(value.value)}`);
        return;
      }

      if (value.type === 'literal') {
        lines.push(`${indent}literal:${value.valueType}:${JSON.stringify(value.value)}`);
        return;
      }

      lines.push(`${indent}${value.opcode} id=${JSON.stringify(value.id)}`);

      for (const key of Object.keys(value.fields)) {
        lines.push(`${indent}  field ${key} = ${JSON.stringify(value.fields[key])}`);
      }

      for (const key of Object.keys(value.inputs)) {
        lines.push(`${indent}  input ${key} =`);
        Renderer.renderInput(value.inputs[key], lines, `${indent}    `);
      }

      for (const key of Object.keys(value.stacks)) {
        lines.push(`${indent}  stack ${key}:`);
        Renderer.renderStack(value.stacks[key], lines, `${indent}    `);
      }
    }
  }

  function cloneAst(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function serializeStringArray(values) {
    return `[${(values || []).map(value => `"${escapeString(value)}"`).join(',')}]`;
  }

  function serializeFieldMapInline(fieldMap) {
    const keys = Object.keys(fieldMap || {}).sort();
    if (!keys.length) return '{}';
    const parts = keys.map(key => `${key}:"${escapeString(fieldMap[key])}"`);
    return `{${parts.join(' ')}}`;
  }

  function serializeLiteralNode(node) {
    if (node.valueType === 'number') {
      return `[literal:number:${String(node.value)}]`;
    }
    if (node.valueType === 'boolean') {
      return `[literal:boolean:${node.value ? 'true' : 'false'}]`;
    }
    return `[literal:string:"${escapeString(node.value)}"]`;
  }

  function serializeMenuNode(node) {
    return `[menu:${node.menuOpcode}:"${escapeString(node.value)}"]`;
  }

  function serializeNodeMapMultiline(nodeMap, indent) {
    const keys = Object.keys(nodeMap || {}).sort();
    if (!keys.length) return '{}';

    const lines = ['{'];
    for (const key of keys) {
      const serialized = serializeAstNode(nodeMap[key], indent + 1).split('\n');
      lines.push(`${indentStr(indent + 1)}${key}:${serialized[0]}`);
      for (let i = 1; i < serialized.length; i++) {
        lines.push(`${indentStr(indent + 1)}${serialized[i]}`);
      }
    }
    lines.push(`${indentStr(indent)}}`);
    return lines.join('\n');
  }

  function serializeOpcodeNode(node, indent) {
    const lines = [`[opcode:${node.opcode}`];
    if (node.id) {
      lines.push(`${indentStr(indent + 1)}id:"${escapeString(node.id)}"`);
    }
    lines.push(`${indentStr(indent + 1)}fields:${serializeFieldMapInline(node.fields || {})}`);
    lines.push(`${indentStr(indent + 1)}inputs:${serializeNodeMapMultiline(node.inputs || {}, indent + 1)}`);
    lines.push(`${indentStr(indent + 1)}stacks:${serializeNodeMapMultiline(node.stacks || {}, indent + 1)}`);
    lines.push(`${indentStr(indent)}]`);
    return lines.join('\n');
  }

  function serializeStackNode(node, indent) {
    const lines = ['[stack:'];
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      const serialized = serializeOpcodeNode(child, indent + 1).split('\n');
      for (const line of serialized) {
        lines.push(`${indentStr(indent + 1)}${line}`);
      }
    }
    lines.push(`${indentStr(indent)}]`);
    return lines.join('\n');
  }

  function serializeAstNode(node, indent = 0) {
    if (node.type === 'literal') return serializeLiteralNode(node);
    if (node.type === 'menu') return serializeMenuNode(node);
    if (node.type === 'stack') return serializeStackNode(node, indent);
    if (node.type === 'opcode') return serializeOpcodeNode(node, indent);
    throw new ValidationError(`Cannot serialize node type ${node.type}`);
  }

  function serializeAst(root) {
    if (root.type === 'script') {
      return [
        '[script',
        `${indentStr(1)}body:${serializeAstNode(root.body, 1)}`,
        ']'
      ].join('\n');
    }

    if (root.type === 'procedure') {
      return [
        '[procedure',
        `${indentStr(1)}proccode:"${escapeString(root.proccode || '')}"`,
        `${indentStr(1)}argumentnames:${serializeStringArray(root.argumentnames || [])}`,
        `${indentStr(1)}argumentdefaults:${serializeStringArray(root.argumentdefaults || [])}`,
        `${indentStr(1)}warp:${root.warp ? 'true' : 'false'}`,
        `${indentStr(1)}body:${serializeAstNode(root.body, 1)}`,
        ']'
      ].join('\n');
    }

    throw new ValidationError(`Cannot serialize root type ${root.type}`);
  }

  function renameVariableInNode(node, fromName, toName) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'opcode') {
      const fields = node.fields || {};
      for (const fieldName of Object.keys(fields)) {
        if (fieldName === 'VARIABLE' && fields[fieldName] === fromName) {
          fields[fieldName] = toName;
        }
      }
    }

    if (node.type === 'stack') {
      for (const child of node.children || []) {
        renameVariableInNode(child, fromName, toName);
      }
      return;
    }

    if (node.type === 'opcode') {
      for (const key of Object.keys(node.inputs || {})) {
        renameVariableInNode(node.inputs[key], fromName, toName);
      }
      for (const key of Object.keys(node.stacks || {})) {
        renameVariableInNode(node.stacks[key], fromName, toName);
      }
    }
  }

  function applyRenameVariable(roots, operation) {
    for (const root of roots) {
      renameVariableInNode(root.body, operation.from, operation.to);
    }
  }

  function applyDetachTopLevelScripts(roots, operation) {
    for (const root of roots) {
      if (root.type !== 'script') continue;
      const children = root.body && Array.isArray(root.body.children) ? root.body.children : [];
      if (!children.length) continue;
      if (children[0].opcode === operation.match.opcode) {
        children.shift();
      }
    }
  }

    function resolveReplaceBodyTarget(roots, target) {
    if (target === undefined || target === null) {
      if (!roots.length) {
        throw new ValidationError('replace_body: no roots to target');
      }
      return 0;
    }
 
    const type = target.type;
 
    if (type === 'procedure') {
      const proccode = target.proccode;
      if (typeof proccode !== 'string' || !proccode) {
        throw new ValidationError(
          'replace_body: target.type "procedure" requires a non-empty proccode'
        );
      }
      const idx = roots.findIndex(
        r => r.type === 'procedure' && r.proccode === proccode
      );
      if (idx === -1) {
        throw new ValidationError(
          `replace_body: no procedure root found with proccode "${proccode}"`
        );
      }
      return idx;
    }
 
    if (type === 'script') {
      const rawIndex = target.index;
      if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex) || rawIndex < 0) {
        throw new ValidationError(
          'replace_body: target.type "script" requires a non-negative integer index'
        );
      }
      const scriptRootIndices = roots
        .map((r, i) => (r.type === 'script' ? i : -1))
        .filter(i => i !== -1);
      const scriptIndex = Math.floor(rawIndex);
      if (scriptIndex >= scriptRootIndices.length) {
        throw new ValidationError(
          `replace_body: script index ${scriptIndex} out of range ` +
          `(${scriptRootIndices.length} script root(s) present)`
        );
      }
      return scriptRootIndices[scriptIndex];
    }
 
    throw new ValidationError(
      `replace_body: unknown target.type "${type}" — must be "procedure" or "script"`
    );
  }
 
  function applyReplaceBody(roots, operation) {
    const rootIndex = resolveReplaceBodyTarget(roots, operation.target);
 
    const bodyText = operation.body;
    if (typeof bodyText !== 'string' || !bodyText.trim()) {
      throw new ValidationError(
        'replace_body: operation.body must be a non-empty IR string'
      );
    }
 
    // Parse body in isolation by wrapping as a temporary [script].
    // This surfaces body parse errors immediately with a useful message.
    const wrappedText = `[script\n  body:${bodyText.trim()}\n]`;
    let parsedBody;
    try {
      const tempRoot = new Parser(wrappedText).parse();
      parsedBody = tempRoot.body;
    } catch (err) {
      throw new ValidationError(
        `replace_body: body IR failed to parse — ${err && err.message ? err.message : String(err)}`
      );
    }
 
    roots[rootIndex].body = parsedBody;
  }

  function applyProjectPatch(roots, patch) {
    if (!patch || patch.version !== 1 || patch.target !== 'project' || !Array.isArray(patch.operations)) {
      throw new ValidationError('Invalid project patch');
    }

    const nextRoots = cloneAst(roots);

    for (const operation of patch.operations) {
      if (!operation || !operation.op) {
        throw new ValidationError('Patch operation missing op');
      }

      if (operation.op === 'rename_variable') {
        if (!operation.from || !operation.to || operation.from === operation.to) {
          throw new ValidationError('rename_variable requires distinct non-empty from/to');
        }
        applyRenameVariable(nextRoots, operation);
        continue;
      }

      if (operation.op === 'detach_top_level_scripts') {
        if (!operation.match || !operation.match.opcode) {
          throw new ValidationError('detach_top_level_scripts requires match.opcode');
        }
        applyDetachTopLevelScripts(nextRoots, operation);
        continue;
      }

      if (operation.op === 'replace_body') {
          if (typeof operation.body !== 'string' || !operation.body.trim()) {
            throw new ValidationError(
              'replace_body requires a non-empty body IR string'
            );
          }
          applyReplaceBody(nextRoots, operation);
          continue;
        }

      throw new ValidationError(`Unsupported patch op ${operation.op}`);
    }

    return nextRoots;
  }

  function applyPatchToIR(irText, patch) {
    try {
      const root = new Parser(irText).parse();
      const patchedRoots = applyProjectPatch([root], patch);
      const output = serializeAst(patchedRoots[0]);
      new Parser(output).parse();
      return {
        ok: true,
        ir: output
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err)
      };
    }
  }

  function applyPatchJsonToIR(irText, patchJsonText) {
    try {
      const patch = JSON.parse(String(patchJsonText || ''));
      return applyPatchToIR(irText, patch);
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : String(err)
      };
    }
  }

  const VISUAL_OPCODE_SPECS = {
    events_whenflagclicked: { shape: 'hat', category: 'events', tokens: ['when green flag clicked'] },
    events_whenkeypressed: { shape: 'hat', category: 'events', tokens: ['when', { field: 'KEY_OPTION' }, 'key pressed'] },
    events_whenthisspriteclicked: { shape: 'hat', category: 'events', tokens: ['when this sprite clicked'] },
    events_whenstageclicked: { shape: 'hat', category: 'events', tokens: ['when stage clicked'] },
    events_whenbackdropswitchesto: { shape: 'hat', category: 'events', tokens: ['when backdrop switches to', { field: 'BACKDROP' }] },
    events_whengreaterthan: { shape: 'hat', category: 'events', tokens: ['when', { field: 'WHENGREATERTHANMENU' }, '>', { input: 'VALUE', shape: 'round' }] },
    events_broadcast: { shape: 'command', category: 'events', tokens: ['broadcast', { slot: ['BROADCAST_INPUT', 'BROADCAST_OPTION'], shape: 'round' }] },
    events_broadcastandwait: { shape: 'command', category: 'events', tokens: ['broadcast', { slot: ['BROADCAST_INPUT', 'BROADCAST_OPTION'], shape: 'round' }, 'and wait'] },

    motion_movesteps: { shape: 'command', category: 'motion', tokens: ['move', { input: 'STEPS', shape: 'round' }, 'steps'] },
    motion_turnright: { shape: 'command', category: 'motion', tokens: ['turn right', { input: 'DEGREES', shape: 'round' }, 'degrees'] },
    motion_turnleft: { shape: 'command', category: 'motion', tokens: ['turn left', { input: 'DEGREES', shape: 'round' }, 'degrees'] },
    motion_goto: { shape: 'command', category: 'motion', tokens: ['go to', { slot: ['TO'], shape: 'round' }] },
    motion_gotoxy: { shape: 'command', category: 'motion', tokens: ['go to x:', { input: 'X', shape: 'round' }, 'y:', { input: 'Y', shape: 'round' }] },
    motion_glideto: { shape: 'command', category: 'motion', tokens: ['glide', { input: 'SECS', shape: 'round' }, 'secs to', { slot: ['TO'], shape: 'round' }] },
    motion_glidesecstoxy: { shape: 'command', category: 'motion', tokens: ['glide', { input: 'SECS', shape: 'round' }, 'secs to x:', { input: 'X', shape: 'round' }, 'y:', { input: 'Y', shape: 'round' }] },
    motion_pointindirection: { shape: 'command', category: 'motion', tokens: ['point in direction', { input: 'DIRECTION', shape: 'round' }] },
    motion_pointtowards: { shape: 'command', category: 'motion', tokens: ['point towards', { slot: ['TOWARDS'], shape: 'round' }] },
    motion_changexby: { shape: 'command', category: 'motion', tokens: ['change x by', { input: 'DX', shape: 'round' }] },
    motion_setx: { shape: 'command', category: 'motion', tokens: ['set x to', { input: 'X', shape: 'round' }] },
    motion_changeyby: { shape: 'command', category: 'motion', tokens: ['change y by', { input: 'DY', shape: 'round' }] },
    motion_sety: { shape: 'command', category: 'motion', tokens: ['set y to', { input: 'Y', shape: 'round' }] },
    motion_ifonedgebounce: { shape: 'command', category: 'motion', tokens: ['if on edge, bounce'] },
    motion_setrotationstyle: { shape: 'command', category: 'motion', tokens: ['set rotation style', { field: 'STYLE' }] },
    motion_xposition: { shape: 'reporter-round', category: 'motion', tokens: ['x position'] },
    motion_yposition: { shape: 'reporter-round', category: 'motion', tokens: ['y position'] },
    motion_direction: { shape: 'reporter-round', category: 'motion', tokens: ['direction'] },

    looks_sayforsecs: { shape: 'command', category: 'looks', tokens: ['say', { input: 'MESSAGE', shape: 'round' }, 'for', { input: 'SECS', shape: 'round' }, 'seconds'] },
    looks_say: { shape: 'command', category: 'looks', tokens: ['say', { input: 'MESSAGE', shape: 'round' }] },
    looks_thinkforsecs: { shape: 'command', category: 'looks', tokens: ['think', { input: 'MESSAGE', shape: 'round' }, 'for', { input: 'SECS', shape: 'round' }, 'seconds'] },
    looks_think: { shape: 'command', category: 'looks', tokens: ['think', { input: 'MESSAGE', shape: 'round' }] },
    looks_switchcostumeto: { shape: 'command', category: 'looks', tokens: ['switch costume to', { slot: ['COSTUME'], shape: 'round' }] },
    looks_nextcostume: { shape: 'command', category: 'looks', tokens: ['next costume'] },
    looks_switchbackdropto: { shape: 'command', category: 'looks', tokens: ['switch backdrop to', { slot: ['BACKDROP'], shape: 'round' }] },
    looks_nextbackdrop: { shape: 'command', category: 'looks', tokens: ['next backdrop'] },
    looks_changesizeby: { shape: 'command', category: 'looks', tokens: ['change size by', { input: 'CHANGE', shape: 'round' }] },
    looks_setsizeto: { shape: 'command', category: 'looks', tokens: ['set size to', { input: 'SIZE', shape: 'round' }, '%'] },
    looks_changeeffectby: { shape: 'command', category: 'looks', tokens: ['change', { field: 'EFFECT' }, 'effect by', { input: 'CHANGE', shape: 'round' }] },
    looks_seteffectto: { shape: 'command', category: 'looks', tokens: ['set', { field: 'EFFECT' }, 'effect to', { input: 'VALUE', shape: 'round' }] },
    looks_cleargraphiceffects: { shape: 'command', category: 'looks', tokens: ['clear graphic effects'] },
    looks_show: { shape: 'command', category: 'looks', tokens: ['show'] },
    looks_hide: { shape: 'command', category: 'looks', tokens: ['hide'] },
    looks_gotofrontback: { shape: 'command', category: 'looks', tokens: ['go to', { field: 'FRONT_BACK' }, 'layer'] },
    looks_goforwardbackwardlayers: { shape: 'command', category: 'looks', tokens: ['go', { field: 'FORWARD_BACKWARD' }, { input: 'NUM', shape: 'round' }, 'layers'] },
    looks_costumenumbername: { shape: 'reporter-round', category: 'looks', tokens: ['costume', { field: 'NUMBER_NAME' }] },
    looks_backdropnumbername: { shape: 'reporter-round', category: 'looks', tokens: ['backdrop', { field: 'NUMBER_NAME' }] },
    looks_size: { shape: 'reporter-round', category: 'looks', tokens: ['size'] },

    sound_play: { shape: 'command', category: 'sound', tokens: ['start sound', { slot: ['SOUND_MENU'], shape: 'round' }] },
    sound_playuntildone: { shape: 'command', category: 'sound', tokens: ['play sound', { slot: ['SOUND_MENU'], shape: 'round' }, 'until done'] },
    sound_stopallsounds: { shape: 'command', category: 'sound', tokens: ['stop all sounds'] },
    sound_changeeffectby: { shape: 'command', category: 'sound', tokens: ['change', { field: 'EFFECT' }, 'effect by', { input: 'VALUE', shape: 'round' }] },
    sound_seteffectto: { shape: 'command', category: 'sound', tokens: ['set', { field: 'EFFECT' }, 'effect to', { input: 'VALUE', shape: 'round' }] },
    sound_cleareffects: { shape: 'command', category: 'sound', tokens: ['clear sound effects'] },
    sound_changevolumeby: { shape: 'command', category: 'sound', tokens: ['change volume by', { input: 'VOLUME', shape: 'round' }] },
    sound_setvolumeto: { shape: 'command', category: 'sound', tokens: ['set volume to', { input: 'VOLUME', shape: 'round' }, '%'] },
    sound_volume: { shape: 'reporter-round', category: 'sound', tokens: ['volume'] },

    control_wait: { shape: 'command', category: 'control', tokens: ['wait', { input: 'DURATION', shape: 'round' }, 'seconds'] },
    control_stop: { shape: 'command', category: 'control', tokens: ['stop', { field: 'STOP_OPTION' }] },
    control_create_clone_of: { shape: 'command', category: 'control', tokens: ['create clone of', { slot: ['CLONE_OPTION'], shape: 'round' }] },
    control_delete_this_clone: { shape: 'cap', category: 'control', tokens: ['delete this clone'] },
    control_start_as_clone: { shape: 'hat', category: 'control', tokens: ['when I start as a clone'] },

    sensing_touchingobject: { shape: 'reporter-boolean', category: 'sensing', tokens: ['touching', { slot: ['TOUCHINGOBJECTMENU'], shape: 'round' }, '?'] },
    sensing_touchingcolor: { shape: 'reporter-boolean', category: 'sensing', tokens: ['touching color', { input: 'COLOR', shape: 'round' }, '?'] },
    sensing_coloristouchingcolor: { shape: 'reporter-boolean', category: 'sensing', tokens: ['color', { input: 'COLOR', shape: 'round' }, 'is touching', { input: 'COLOR2', shape: 'round' }, '?'] },
    sensing_distanceto: { shape: 'reporter-round', category: 'sensing', tokens: ['distance to', { slot: ['DISTANCETOMENU'], shape: 'round' }] },
    sensing_askandwait: { shape: 'command', category: 'sensing', tokens: ['ask', { input: 'QUESTION', shape: 'round' }, 'and wait'] },
    sensing_answer: { shape: 'reporter-round', category: 'sensing', tokens: ['answer'] },
    sensing_keypressed: { shape: 'reporter-boolean', category: 'sensing', tokens: [{ slot: ['KEY_OPTION'], shape: 'round' }, 'key pressed?'] },
    sensing_mousedown: { shape: 'reporter-boolean', category: 'sensing', tokens: ['mouse down?'] },
    sensing_mousex: { shape: 'reporter-round', category: 'sensing', tokens: ['mouse x'] },
    sensing_mousey: { shape: 'reporter-round', category: 'sensing', tokens: ['mouse y'] },
    sensing_setdragmode: { shape: 'command', category: 'sensing', tokens: ['set drag mode', { field: 'DRAG_MODE' }] },
    sensing_loudness: { shape: 'reporter-round', category: 'sensing', tokens: ['loudness'] },
    sensing_timer: { shape: 'reporter-round', category: 'sensing', tokens: ['timer'] },
    sensing_resettimer: { shape: 'command', category: 'sensing', tokens: ['reset timer'] },
    sensing_of: { shape: 'reporter-round', category: 'sensing', tokens: [{ field: 'PROPERTY' }, 'of', { slot: ['OBJECT'], shape: 'round' }] },
    sensing_current: { shape: 'reporter-round', category: 'sensing', tokens: ['current', { field: 'CURRENTMENU' }] },
    sensing_dayssince2000: { shape: 'reporter-round', category: 'sensing', tokens: ['days since 2000'] },
    sensing_username: { shape: 'reporter-round', category: 'sensing', tokens: ['username'] },

    operator_add: { shape: 'reporter-round', category: 'operators', tokens: [{ input: 'NUM1', shape: 'round' }, '+', { input: 'NUM2', shape: 'round' }] },
    operator_subtract: { shape: 'reporter-round', category: 'operators', tokens: [{ input: 'NUM1', shape: 'round' }, '-', { input: 'NUM2', shape: 'round' }] },
    operator_multiply: { shape: 'reporter-round', category: 'operators', tokens: [{ input: 'NUM1', shape: 'round' }, '*', { input: 'NUM2', shape: 'round' }] },
    operator_divide: { shape: 'reporter-round', category: 'operators', tokens: [{ input: 'NUM1', shape: 'round' }, '/', { input: 'NUM2', shape: 'round' }] },
    operator_random: { shape: 'reporter-round', category: 'operators', tokens: ['pick random', { input: 'FROM', shape: 'round' }, 'to', { input: 'TO', shape: 'round' }] },
    operator_gt: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'OPERAND1', shape: 'round' }, '>', { input: 'OPERAND2', shape: 'round' }] },
    operator_lt: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'OPERAND1', shape: 'round' }, '<', { input: 'OPERAND2', shape: 'round' }] },
    operator_equals: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'OPERAND1', shape: 'round' }, '=', { input: 'OPERAND2', shape: 'round' }] },
    operator_and: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'OPERAND1', shape: 'boolean' }, 'and', { input: 'OPERAND2', shape: 'boolean' }] },
    operator_or: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'OPERAND1', shape: 'boolean' }, 'or', { input: 'OPERAND2', shape: 'boolean' }] },
    operator_not: { shape: 'reporter-boolean', category: 'operators', tokens: ['not', { input: 'OPERAND', shape: 'boolean' }] },
    operator_join: { shape: 'reporter-round', category: 'operators', tokens: ['join', { input: 'STRING1', shape: 'round' }, { input: 'STRING2', shape: 'round' }] },
    operator_letter_of: { shape: 'reporter-round', category: 'operators', tokens: ['letter', { input: 'LETTER', shape: 'round' }, 'of', { input: 'STRING', shape: 'round' }] },
    operator_length: { shape: 'reporter-round', category: 'operators', tokens: ['length of', { input: 'STRING', shape: 'round' }] },
    operator_contains: { shape: 'reporter-boolean', category: 'operators', tokens: [{ input: 'STRING1', shape: 'round' }, 'contains', { input: 'STRING2', shape: 'round' }, '?'] },
    operator_mod: { shape: 'reporter-round', category: 'operators', tokens: [{ input: 'NUM1', shape: 'round' }, 'mod', { input: 'NUM2', shape: 'round' }] },
    operator_round: { shape: 'reporter-round', category: 'operators', tokens: ['round', { input: 'NUM', shape: 'round' }] },
    operator_mathop: { shape: 'reporter-round', category: 'operators', tokens: [{ field: 'OPERATOR' }, 'of', { input: 'NUM', shape: 'round' }] },

    data_setvariableto: { shape: 'command', category: 'data', tokens: ['set', { field: 'VARIABLE' }, 'to', { input: 'VALUE', shape: 'round' }] },
    data_changevariableby: { shape: 'command', category: 'data', tokens: ['change', { field: 'VARIABLE' }, 'by', { input: 'VALUE', shape: 'round' }] },
    data_showvariable: { shape: 'command', category: 'data', tokens: ['show variable', { field: 'VARIABLE' }] },
    data_hidevariable: { shape: 'command', category: 'data', tokens: ['hide variable', { field: 'VARIABLE' }] },
    data_variable: { shape: 'reporter-round', category: 'data', tokens: [{ field: 'VARIABLE' }] },
    data_addtolist: { shape: 'command', category: 'data', tokens: ['add', { input: 'ITEM', shape: 'round' }, 'to', { field: 'LIST' }] },
    data_deleteoflist: { shape: 'command', category: 'data', tokens: ['delete', { input: 'INDEX', shape: 'round' }, 'of', { field: 'LIST' }] },
    data_deletealloflist: { shape: 'command', category: 'data', tokens: ['delete all of', { field: 'LIST' }] },
    data_insertatlist: { shape: 'command', category: 'data', tokens: ['insert', { input: 'ITEM', shape: 'round' }, 'at', { input: 'INDEX', shape: 'round' }, 'of', { field: 'LIST' }] },
    data_replaceitemoflist: { shape: 'command', category: 'data', tokens: ['replace item', { input: 'INDEX', shape: 'round' }, 'of', { field: 'LIST' }, 'with', { input: 'ITEM', shape: 'round' }] },
    data_itemoflist: { shape: 'reporter-round', category: 'data', tokens: ['item', { input: 'INDEX', shape: 'round' }, 'of', { field: 'LIST' }] },
    data_itemnumoflist: { shape: 'reporter-round', category: 'data', tokens: ['item # of', { input: 'ITEM', shape: 'round' }, 'in', { field: 'LIST' }] },
    data_lengthoflist: { shape: 'reporter-round', category: 'data', tokens: ['length of', { field: 'LIST' }] },
    data_listcontainsitem: { shape: 'reporter-boolean', category: 'data', tokens: [{ field: 'LIST' }, 'contains', { input: 'ITEM', shape: 'round' }, '?'] },
    data_showlist: { shape: 'command', category: 'data', tokens: ['show list', { field: 'LIST' }] },
    data_hidelist: { shape: 'command', category: 'data', tokens: ['hide list', { field: 'LIST' }] },

    pen_clear: { shape: 'command', category: 'pen', tokens: ['erase all'] },
    pen_stamp: { shape: 'command', category: 'pen', tokens: ['stamp'] },
    pen_penDown: { shape: 'command', category: 'pen', tokens: ['pen down'] },
    pen_penUp: { shape: 'command', category: 'pen', tokens: ['pen up'] },
    pen_setPenColorToColor: { shape: 'command', category: 'pen', tokens: ['set pen color to', { input: 'COLOR', shape: 'round' }] },
    pen_changePenColorParamBy: { shape: 'command', category: 'pen', tokens: ['change pen', { field: 'COLOR_PARAM' }, 'by', { input: 'VALUE', shape: 'round' }] },
    pen_setPenColorParamTo: { shape: 'command', category: 'pen', tokens: ['set pen', { field: 'COLOR_PARAM' }, 'to', { input: 'VALUE', shape: 'round' }] },
    pen_changePenSizeBy: { shape: 'command', category: 'pen', tokens: ['change pen size by', { input: 'SIZE', shape: 'round' }] },
    pen_setPenSizeTo: { shape: 'command', category: 'pen', tokens: ['set pen size to', { input: 'SIZE', shape: 'round' }] },

    argument_reporter_string_number: { shape: 'reporter-round', category: 'custom', tokens: [{ field: 'VALUE' }] },
    argument_reporter_boolean: { shape: 'reporter-boolean', category: 'custom', tokens: [{ field: 'VALUE' }] }
  };

  const MENU_FIELD_NAME_BY_OPCODE = {
    motion_goto_menu: 'TO',
    motion_glideto_menu: 'TO',
    motion_pointtowards_menu: 'TOWARDS',
    looks_costume: 'COSTUME',
    looks_backdrops: 'BACKDROP',
    sound_sounds_menu: 'SOUND_MENU',
    event_broadcast_menu: 'BROADCAST_OPTION',
    sensing_touchingobjectmenu: 'TOUCHINGOBJECTMENU',
    sensing_distancetomenu: 'DISTANCETOMENU',
    sensing_keyoptions: 'KEY_OPTION',
    control_create_clone_of_menu: 'CLONE_OPTION'
  };

  const VARIABLE_FIELD_TYPE_BY_NAME = {
    VARIABLE: '',
    LIST: 'list',
    BROADCAST_OPTION: 'broadcast_msg'
  };

  function escapeString(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  const DYNAMIC_MENU_OUTPUT_SPECS = {
    motion_goto_menu: { fieldName: 'TO', categoryExtension: 'colours_motion' },
    motion_glideto_menu: { fieldName: 'TO', categoryExtension: 'colours_motion' },
    motion_pointtowards_menu: { fieldName: 'TOWARDS', categoryExtension: 'colours_motion' },
    looks_costume: { fieldName: 'COSTUME', categoryExtension: 'colours_looks' },
    looks_backdrops: { fieldName: 'BACKDROP', categoryExtension: 'colours_looks' },
    sound_sounds_menu: { fieldName: 'SOUND_MENU', categoryExtension: 'colours_sounds' },
    sensing_touchingobjectmenu: { fieldName: 'TOUCHINGOBJECTMENU', categoryExtension: 'colours_sensing' },
    sensing_distancetomenu: { fieldName: 'DISTANCETOMENU', categoryExtension: 'colours_sensing' },
    control_create_clone_of_menu: { fieldName: 'CLONE_OPTION', categoryExtension: 'colours_control' }
  };

  function escapeXmlText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeXmlAttr(value) {
    return escapeXmlText(value)
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function blockInputKeys(node) {
    return Object.keys(node?.inputs || {}).sort();
  }

  function defaultArgumentIds(argumentnames) {
    return argumentnames.map((_, index) => `arg${index}`);
  }

  function variableIdFor(name, type) {
    const prefix = type === 'list' ? 'list' : type === 'broadcast_msg' ? 'broadcast' : 'scalar';
    return `${prefix}:${name}`;
  }

  function collectDeclaredVariables(node, out = new Map()) {
    if (!node || typeof node !== 'object') return out;

    if (node.type === 'procedure') {
      collectDeclaredVariables(node.body, out);
      return out;
    }

    if (node.type === 'stack') {
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) {
        collectDeclaredVariables(child, out);
      }
      return out;
    }

    if (node.type !== 'opcode') return out;

    const fields = node.fields || {};
    for (const fieldName of Object.keys(fields)) {
      if (Object.prototype.hasOwnProperty.call(VARIABLE_FIELD_TYPE_BY_NAME, fieldName)) {
        const type = VARIABLE_FIELD_TYPE_BY_NAME[fieldName];
        const name = String(fields[fieldName]);
        if (name) {
          out.set(`${type}:${name}`, { name, type });
        }
      }
    }

    const inputs = node.inputs || {};
    for (const key of Object.keys(inputs)) {
      collectDeclaredVariables(inputs[key], out);
    }

    const stacks = node.stacks || {};
    for (const key of Object.keys(stacks)) {
      collectDeclaredVariables(stacks[key], out);
    }

    return out;
  }

  function variablesXml(node) {
    const vars = Array.from(collectDeclaredVariables(node).values())
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    if (!vars.length) return '';
    const body = vars
      .map(variable => `<variable type="${escapeXmlAttr(variable.type)}" id="${escapeXmlAttr(variableIdFor(variable.name, variable.type))}">${escapeXmlText(variable.name)}</variable>`)
      .join('');
    return `<variables>${body}</variables>`;
  }

  function procedureMutationXml(node) {
    const argumentIds = defaultArgumentIds(node.argumentnames || []);
    return `<mutation proccode="${escapeXmlAttr(node.proccode || '')}" argumentids="${escapeXmlAttr(JSON.stringify(argumentIds))}" argumentnames="${escapeXmlAttr(JSON.stringify(node.argumentnames || []))}" argumentdefaults="${escapeXmlAttr(JSON.stringify(node.argumentdefaults || []))}" warp="${node.warp ? 'true' : 'false'}"></mutation>`;
  }

  function opcodeMutationXml(node) {
    if (node.opcode === 'procedures_call') {
      const inputKeys = blockInputKeys(node);
      return `<mutation proccode="${escapeXmlAttr((node.fields && node.fields.PROCCODE) || '')}" argumentids="${escapeXmlAttr(JSON.stringify(inputKeys))}" argumentnames="${escapeXmlAttr(JSON.stringify(inputKeys))}" argumentdefaults="${escapeXmlAttr(JSON.stringify(inputKeys.map(() => '')))}" warp="false"></mutation>`;
    }
    return '';
  }

  function literalShadowXml(node) {
    if (node.valueType === 'number') {
      return `<shadow type="math_number"><field name="NUM">${escapeXmlText(node.value)}</field></shadow>`;
    }
    return `<shadow type="text"><field name="TEXT">${escapeXmlText(node.value)}</field></shadow>`;
  }

  function menuShadowXml(node) {
    const fieldName = MENU_FIELD_NAME_BY_OPCODE[node.menuOpcode] || 'VALUE';
    return `<shadow type="${escapeXmlAttr(node.menuOpcode)}"><field name="${escapeXmlAttr(fieldName)}">${escapeXmlText(node.value)}</field></shadow>`;
  }

  function inputNodeXml(node) {
    if (!node) return '';
    if (node.type === 'literal') return literalShadowXml(node);
    if (node.type === 'menu') return menuShadowXml(node);
    return opcodeBlockXml(node);
  }

  function inputListXml(node) {
    const inputs = node.inputs || {};
    return Object.keys(inputs)
      .sort()
      .map(name => `<value name="${escapeXmlAttr(name)}">${inputNodeXml(inputs[name])}</value>`)
      .join('');
  }

  function fieldListXml(node) {
    const fields = node.fields || {};
    return Object.keys(fields)
      .sort()
      .filter(name => !(node.opcode === 'procedures_call' && name === 'PROCCODE'))
      .map(name => {
        const value = fields[name];
        if (Object.prototype.hasOwnProperty.call(VARIABLE_FIELD_TYPE_BY_NAME, name)) {
          const type = VARIABLE_FIELD_TYPE_BY_NAME[name];
          return `<field name="${escapeXmlAttr(name)}" id="${escapeXmlAttr(variableIdFor(value, type))}" variabletype="${escapeXmlAttr(type)}">${escapeXmlText(value)}</field>`;
        }
        return `<field name="${escapeXmlAttr(name)}">${escapeXmlText(value)}</field>`;
      })
      .join('');
  }

  function statementListXml(node) {
    const stacks = node.stacks || {};
    return Object.keys(stacks)
      .sort()
      .map(name => `<statement name="${escapeXmlAttr(name)}">${stackChainXml(stacks[name])}</statement>`)
      .join('');
  }

  function opcodeBlockXml(node, nextXml = '') {
    const mutation = opcodeMutationXml(node);
    const fields = fieldListXml(node);
    const inputs = inputListXml(node);
    const statements = statementListXml(node);
    return `<block type="${escapeXmlAttr(node.opcode)}"${node.id ? ` id="${escapeXmlAttr(node.id)}"` : ''}>${mutation}${fields}${inputs}${statements}${nextXml}</block>`;
  }

  function stackChainXml(stack) {
    const children = Array.isArray(stack?.children) ? stack.children : [];
    if (!children.length) return '';

    function renderAt(index) {
      const nextXml = index + 1 < children.length ? `<next>${renderAt(index + 1)}</next>` : '';
      return opcodeBlockXml(children[index], nextXml);
    }

    return renderAt(0);
  }

  function astToScratchBlocksXml(node) {
    const bodyXml = stackChainXml(node.body);
    const variableDeclarations = variablesXml(node);

    if (node.type === 'script') {
      return `<xml xmlns="https://developers.google.com/blockly/xml">${variableDeclarations}${bodyXml}</xml>`;
    }

    const nextXml = bodyXml ? `<next>${bodyXml}</next>` : '';
    return `<xml xmlns="https://developers.google.com/blockly/xml">${variableDeclarations}<block type="procedures_definition"><statement name="custom_block"><block type="procedures_prototype">${procedureMutationXml(node)}</block></statement>${nextXml}</block></xml>`;
  }

  function registerDynamicMenuOutputBlocks(scratchBlocks) {
    if (!scratchBlocks || !scratchBlocks.Blocks) return;

    for (const opcode of Object.keys(DYNAMIC_MENU_OUTPUT_SPECS)) {
      const existing = scratchBlocks.Blocks[opcode];
      if (existing && typeof existing.init === 'function') {
        continue;
      }

      const spec = DYNAMIC_MENU_OUTPUT_SPECS[opcode];
      scratchBlocks.Blocks[opcode] = {
        init: function () {
          if (typeof this.jsonInit === 'function') {
            this.jsonInit({
              message0: '%1',
              args0: [
                {
                  type: 'field_label_serializable',
                  name: spec.fieldName,
                  text: ''
                }
              ],
              extensions: [spec.categoryExtension, 'output_string']
            });
            return;
          }

          if (typeof this.appendDummyInput === 'function') {
            this.appendDummyInput().appendField('', spec.fieldName);
          }
          if (typeof this.setOutput === 'function') {
            this.setOutput(true, 'String');
          }
          if (typeof this.setStyle === 'function') {
            this.setStyle(spec.categoryExtension.replace(/^colours_/, ''));
          }
        }
      };
    }
  }

  function ensureScratchBlocksReady(scratchBlocks) {
    if (!scratchBlocks || typeof scratchBlocks !== 'object') return;

    if (!scratchBlocks.__blockifyPreviewInitialized) {
      registerDynamicMenuOutputBlocks(scratchBlocks);

      if (typeof scratchBlocks.installAllBlocks === 'function') {
        scratchBlocks.installAllBlocks();
      }

      if (
        scratchBlocks.ScratchMsgs &&
        typeof scratchBlocks.ScratchMsgs.setLocale === 'function'
      ) {
        scratchBlocks.ScratchMsgs.setLocale('en');
      }

      scratchBlocks.__blockifyPreviewInitialized = true;
    }
  }

  function runEmbeddedWorkspaceLayoutPass(workspace, scratchBlocks, topBlocks) {
    if (workspace && typeof workspace.render === 'function') {
      workspace.render();
    }
    if (
      workspace &&
      typeof workspace.centerOnBlock === 'function' &&
      Array.isArray(topBlocks) &&
      topBlocks.length &&
      topBlocks[0] &&
      topBlocks[0].id
    ) {
      workspace.centerOnBlock(topBlocks[0].id);
    }
    if (workspace && typeof workspace.resizeContents === 'function') {
      workspace.resizeContents();
    }
    if (scratchBlocks && typeof scratchBlocks.svgResize === 'function') {
      scratchBlocks.svgResize(workspace);
    }
  }

  function getBlocklyStyleDiagnostics(doc) {
    const diagnostics = {
      commonCssInjected: 'false',
      rendererCssInjected: 'false',
      rendererCssIds: ''
    };

    if (!doc) {
      return diagnostics;
    }

    if (doc.getElementById && doc.getElementById('blockly-common-style')) {
      diagnostics.commonCssInjected = 'true';
    }

    const rendererIds = [];
    const visit = node => {
      if (!node || !node.children || !node.children.length) return;
      for (const child of node.children) {
        if (
          child &&
          child.id &&
          typeof child.id === 'string' &&
          child.id.indexOf('blockly-renderer-style-') === 0
        ) {
          rendererIds.push(child.id);
        }
        visit(child);
      }
    };

    visit(doc.head);
    visit(doc.body);

    if (rendererIds.length) {
      diagnostics.rendererCssInjected = 'true';
      diagnostics.rendererCssIds = rendererIds.join(', ');
    }

    return diagnostics;
  }

  function createScratchPreviewTheme() {
    const makeBlockStyle = (primary, secondary, tertiary) => ({
      colourPrimary: primary,
      colourSecondary: secondary,
      colourTertiary: tertiary,
      hat: ''
    });

    return {
      name: 'blockifyScratchPreviewTheme',
      blockStyles: {
        control: makeBlockStyle('#FFAB19', '#CF8B17', '#DB6E00'),
        data: makeBlockStyle('#FF8C1A', '#DB6E00', '#BD5F00'),
        data_lists: makeBlockStyle('#FF661A', '#E64D00', '#CC3D00'),
        sounds: makeBlockStyle('#CF63CF', '#C94FC9', '#BD42BD'),
        motion: makeBlockStyle('#4C97FF', '#4280D7', '#3373CC'),
        looks: makeBlockStyle('#9966FF', '#855CD6', '#774DCB'),
        event: makeBlockStyle('#FFBF00', '#E6AC00', '#CC9900'),
        sensing: makeBlockStyle('#5CB1D6', '#47A8D1', '#2E8EB8'),
        pen: makeBlockStyle('#0FBD8C', '#0DA57A', '#0B8F69'),
        operators: makeBlockStyle('#59C059', '#46B946', '#389438'),
        more: makeBlockStyle('#FF6680', '#FF4D6A', '#FF3355'),
        textField: makeBlockStyle('#FFFFFF', '#F2F2F2', '#E6E6E6')
      },
      categoryStyles: {
        control: { colour: '#FFAB19' },
        data: { colour: '#FF8C1A' },
        data_lists: { colour: '#FF661A' },
        sounds: { colour: '#CF63CF' },
        motion: { colour: '#4C97FF' },
        looks: { colour: '#9966FF' },
        event: { colour: '#FFBF00' },
        sensing: { colour: '#5CB1D6' },
        pen: { colour: '#0FBD8C' },
        operators: { colour: '#59C059' },
        more: { colour: '#FF6680' }
      },
      componentStyles: {
        workspaceBackgroundColour: '#F9F9F9',
        toolboxBackgroundColour: '#FFFFFF',
        toolboxForegroundColour: '#575E75',
        flyoutBackgroundColour: '#F9F9F9',
        flyoutForegroundColour: '#575E75',
        flyoutOpacity: 1,
        scrollbarColour: '#CECDCE',
        scrollbarOpacity: 1,
        insertionMarkerColour: '#000000',
        insertionMarkerOpacity: 0.2
      },
      fontStyle: {
        family: 'Helvetica, Arial, sans-serif',
        weight: 'bold',
        size: 12
      },
      startHats: true
    };
  }

  function renderProcedureWithScratchBlocks(root, node, scratchBlocks) {
    if (!root || !node || !scratchBlocks || typeof scratchBlocks.inject !== 'function') {
      if (root && root.dataset) {
        root.dataset.renderMode = 'fallback';
        root.dataset.renderError = 'scratch-blocks unavailable';
      }
      return false;
    }

    try {
      ensureScratchBlocksReady(scratchBlocks);

      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }

      const host = document.createElement('div');
      host.className = 'bfv-scratch-workspace';
      host.style.width = '100%';
      if (root.dataset && root.dataset.viewportFill === 'true') {
        host.style.height = '100%';
        host.style.minHeight = '100%';
      } else {
        host.style.height = '240px';
        host.style.minHeight = '240px';
      }
      host.style.position = 'relative';
      root.appendChild(host);

      const workspace = scratchBlocks.inject(host, {
        readOnly: true,
        theme: createScratchPreviewTheme(),
        scratchTheme: scratchBlocks.ScratchBlocksTheme && scratchBlocks.ScratchBlocksTheme.CLASSIC
          ? scratchBlocks.ScratchBlocksTheme.CLASSIC
          : 'classic',
        scrollbars: true,
        trashcan: false,
        zoom: {
          controls: false,
          wheel: true,
          startScale: 0.9,
          maxScale: 2,
          minScale: 0.3
        },
        move: {
          drag: true,
          wheel: true,
          scrollbars: true
        }
      });

      const textToDom =
        scratchBlocks.utils &&
        scratchBlocks.utils.xml &&
        typeof scratchBlocks.utils.xml.textToDom === 'function'
          ? scratchBlocks.utils.xml.textToDom
          : scratchBlocks.Xml && typeof scratchBlocks.Xml.textToDom === 'function'
            ? scratchBlocks.Xml.textToDom
            : null;

      if (!textToDom || !scratchBlocks.Xml || typeof scratchBlocks.Xml.domToWorkspace !== 'function') {
        throw new Error('scratch-blocks XML APIs unavailable');
      }

      const xmlText = astToScratchBlocksXml(node);
      const xmlDom = textToDom(xmlText);
      scratchBlocks.Xml.domToWorkspace(xmlDom, workspace);
      let topBlocks = [];
      if (workspace && typeof workspace.getTopBlocks === 'function') {
        topBlocks = workspace.getTopBlocks(false) || [];
        if (Array.isArray(topBlocks) && topBlocks.length && topBlocks[0] && typeof topBlocks[0].moveBy === 'function') {
          topBlocks[0].moveBy(24, 24);
        }
      }
      runEmbeddedWorkspaceLayoutPass(workspace, scratchBlocks, topBlocks);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          runEmbeddedWorkspaceLayoutPass(workspace, scratchBlocks, topBlocks);
        });
      }
      const cssDiagnostics = getBlocklyStyleDiagnostics(document);
      if (root.dataset) {
        root.dataset.renderMode = 'embedded';
        root.dataset.renderError = '';
        root.dataset.blockCount = Array.isArray(topBlocks) ? String(topBlocks.length) : '0';
        root.dataset.topBlockId =
          Array.isArray(topBlocks) && topBlocks.length && topBlocks[0] && topBlocks[0].id
            ? String(topBlocks[0].id)
            : '';
        root.dataset.commonCssInjected = cssDiagnostics.commonCssInjected;
        root.dataset.rendererCssInjected = cssDiagnostics.rendererCssInjected;
        root.dataset.rendererCssIds = cssDiagnostics.rendererCssIds;
      }
      return true;
    } catch (err) {
      const cssDiagnostics = getBlocklyStyleDiagnostics(document);
      if (root.dataset) {
        root.dataset.renderMode = 'fallback';
        root.dataset.renderError = err && err.message ? err.message : String(err);
        root.dataset.blockCount = '0';
        root.dataset.topBlockId = '';
        root.dataset.commonCssInjected = cssDiagnostics.commonCssInjected;
        root.dataset.rendererCssInjected = cssDiagnostics.rendererCssInjected;
        root.dataset.rendererCssIds = cssDiagnostics.rendererCssIds;
      }
      return false;
    }
  }

  function buildEditorStatusText(owner) {
    const errorText = owner.lastError ? `ERROR:\n${owner.lastError}` : 'ERROR:\n[none]';
    const renderText = owner.lastRender ? `\n\nRENDER:\n${owner.lastRender}` : '\n\nRENDER:\n[none]';
    const patchErrorText = owner.lastPatchError ? `\n\nPATCH ERROR:\n${owner.lastPatchError}` : '\n\nPATCH ERROR:\n[none]';
    const patchedStateText = owner.lastPatchedIR ? '\n\nPATCHED IR:\navailable' : '\n\nPATCHED IR:\n[none]';
    const modeText = owner.lastVisualRenderMode ? `\n\nVISUAL MODE:\n${owner.lastVisualRenderMode}` : '\n\nVISUAL MODE:\n[none]';
    const visualErrorText = owner.lastVisualRenderError ? `\n\nVISUAL ERROR:\n${owner.lastVisualRenderError}` : '\n\nVISUAL ERROR:\n[none]';
    const visualCountText = owner.lastVisualBlockCount ? `\n\nVISUAL BLOCKS:\n${owner.lastVisualBlockCount}` : '\n\nVISUAL BLOCKS:\n[none]';
    const visualTopBlockText = owner.lastVisualTopBlockId ? `\n\nVISUAL TOP BLOCK:\n${owner.lastVisualTopBlockId}` : '\n\nVISUAL TOP BLOCK:\n[none]';
    const visualCssText = owner.lastVisualCssStatus ? `\n\nVISUAL CSS:\n${owner.lastVisualCssStatus}` : '\n\nVISUAL CSS:\n[none]';
    return `${errorText}${renderText}${patchErrorText}${patchedStateText}${modeText}${visualErrorText}${visualCountText}${visualTopBlockText}${visualCssText}`;
  }

  function getPreferredPreviewIR(owner, fallbackIR = '') {
    if (owner && owner.lastPatchedIR) {
      return owner.lastPatchedIR;
    }
    if (owner && owner.irBuffer) {
      return owner.irBuffer;
    }
    return String(fallbackIR || '');
  }

  function refreshVisualPreview(owner, visual, irText) {
    owner.lastVisualRenderMode = '';
    owner.lastVisualRenderError = '';
    owner.lastVisualBlockCount = '';
    owner.lastVisualTopBlockId = '';
    owner.lastVisualCssStatus = '';
    visual.innerHTML = '';

    try {
      const parser = new Parser(irText);
      const ast = parser.parse();

      injectVisualStyles();
      const scratchBlocks = typeof globalThis !== 'undefined' ? globalThis.__blockifyScratchBlocks : null;
      if (!renderProcedureWithScratchBlocks(visual, ast, scratchBlocks)) {
        const vr = new VisualRenderer(visual);
        vr.renderProcedure(ast);
      }
      owner.lastVisualRenderMode = visual.dataset && visual.dataset.renderMode ? visual.dataset.renderMode : '';
      owner.lastVisualRenderError = visual.dataset && visual.dataset.renderError ? visual.dataset.renderError : '';
      owner.lastVisualBlockCount = visual.dataset && visual.dataset.blockCount ? visual.dataset.blockCount : '';
      owner.lastVisualTopBlockId = visual.dataset && visual.dataset.topBlockId ? visual.dataset.topBlockId : '';
      const commonCssInjected = visual.dataset && visual.dataset.commonCssInjected ? visual.dataset.commonCssInjected : '';
      const rendererCssInjected = visual.dataset && visual.dataset.rendererCssInjected ? visual.dataset.rendererCssInjected : '';
      const rendererCssIds = visual.dataset && visual.dataset.rendererCssIds ? visual.dataset.rendererCssIds : '';
      owner.lastVisualCssStatus =
        commonCssInjected || rendererCssInjected
          ? `common=${commonCssInjected || 'false'}, renderer=${rendererCssInjected || 'false'}${rendererCssIds ? `, ids=${rendererCssIds}` : ''}`
          : '';
    } catch {
      // do nothing (errors already shown)
    }
  }

  function updateEditorPreviewState(owner, visual, irText) {
    if (owner && typeof owner.validateIR === 'function' && typeof owner.renderIR === 'function') {
      owner.validateIR({ IR: irText });
      owner.renderIR({ IR: irText });
    } else {
      if (!irText || !String(irText).trim()) {
        owner.lastError = 'IR input is empty';
        owner.lastRender = '';
      } else {
        try {
          const parser = new Parser(irText);
          const ast = parser.parse();
          owner.lastError = '';
          owner.lastRender = Renderer.renderProcedure(ast);
        } catch (err) {
          owner.lastError = err && err.message ? err.message : String(err);
          owner.lastRender = '';
        }
      }
    }
    refreshVisualPreview(owner, visual, getPreferredPreviewIR(owner, irText));
  }

  class VisualRenderer {
    constructor(root) {
        this.root = root;
    }

    clear() {
        while (this.root.firstChild) {
        this.root.removeChild(this.root.firstChild);
        }
    }

    renderProcedure(node) {
        this.clear();

        if (node.type === 'script') {
        const shell = this.el('div', 'bfv-script-shell');
        shell.dataset.nodeKind = 'script';

        const body = this.el('div', 'bfv-script-body');
        body.appendChild(this.renderStack(node.body));

        shell.appendChild(body);
        this.root.appendChild(shell);
        return;
        }

        const shell = this.el('div', 'bfv-procedure-shell');
        shell.dataset.nodeKind = 'procedure';

        const header = this.el('div', 'bfv-procedure-header');
        header.appendChild(this.el('div', 'bfv-procedure-title', node.proccode));

        const body = this.el('div', 'bfv-procedure-body');
        body.appendChild(this.renderStack(node.body));

        shell.appendChild(header);
        shell.appendChild(body);
        this.root.appendChild(shell);
    }

    renderNode(node, context = null) {
        if (!node || typeof node !== 'object') {
        return this.renderUnknown('invalid');
        }

        if (node.type === 'stack') {
        return this.renderStack(node);
        }

        if (node.type === 'literal') {
        return this.renderLiteral(node, context);
        }

        if (node.type === 'menu') {
        return this.renderMenu(node, context);
        }

        if (node.type === 'opcode') {
        return this.renderOpcode(node, context);
        }

        return this.renderUnknown(node.type || 'unknown');
    }

    renderStack(stackNode) {
        const stack = this.el('div', 'bfv-stack');
        stack.dataset.nodeKind = 'stack';

        const children = Array.isArray(stackNode.children) ? stackNode.children : [];

        if (!children.length) {
        stack.appendChild(this.renderEmptyStack());
        return stack;
        }

        for (const child of children) {
        stack.appendChild(this.renderNode(child));
        }

        return stack;
    }

    renderOpcode(node, context = null) {
        const controlBlock = this.renderKnownControlOpcode(node);
        if (controlBlock) {
          return controlBlock;
        }

        if (node.opcode === 'procedures_call') {
          return this.renderProceduresCall(node);
        }

        const spec = VISUAL_OPCODE_SPECS[node.opcode];
        if (spec) {
          return this.renderSpecOpcode(node, spec);
        }

        const generic = this.renderGenericScratchOpcode(node);
        if (generic) {
          return generic;
        }

        return this.renderUnknownOpcode(node);
    }

    renderKnownControlOpcode(node) {
        switch (node.opcode) {
        case 'control_if':
            return this.renderControlIf(node);
        case 'control_if_else':
            return this.renderControlIfElse(node);
        case 'control_repeat':
            return this.renderControlRepeat(node);
        case 'control_forever':
            return this.renderControlForever(node);
        case 'control_wait_until':
            return this.renderControlWaitUntil(node);
        case 'control_repeat_until':
            return this.renderControlRepeatUntil(node);
        default:
            return null;
        }
    }

    renderControlIf(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['if', { input: 'CONDITION', shape: 'boolean' }], stack: 'SUBSTACK' }
        ]);
    }

    renderControlIfElse(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['if', { input: 'CONDITION', shape: 'boolean' }], stack: 'SUBSTACK' },
          { tokens: ['else'], stack: 'SUBSTACK2', middle: true }
        ]);
    }

    renderControlRepeat(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['repeat', { input: 'TIMES', shape: 'round' }], stack: 'SUBSTACK' }
        ]);
    }

    renderControlForever(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['forever'], stack: 'SUBSTACK' }
        ]);
    }

    renderControlWaitUntil(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['wait until', { input: 'CONDITION', shape: 'boolean' }], stack: null }
        ], 'command-like');
    }

    renderControlRepeatUntil(node) {
        return this.renderCBlock(node, 'control', [
          { tokens: ['repeat until', { input: 'CONDITION', shape: 'boolean' }], stack: 'SUBSTACK' }
        ]);
    }

    renderProceduresCall(node) {
        const tokens = [];
        const procCode = node.fields && Object.prototype.hasOwnProperty.call(node.fields, 'PROCCODE')
          ? String(node.fields.PROCCODE)
          : '';
        const parts = procCode ? procCode.split(/(%[sbn])/g).filter(Boolean) : [];
        const inputKeys = Object.keys(node.inputs || {}).sort();
        let inputIndex = 0;

        if (!parts.length) {
          return this.renderGenericKnownOpcode(node, 'custom', 'command');
        }

        for (const part of parts) {
          if (part === '%s' || part === '%n' || part === '%b') {
            const key = inputKeys[inputIndex++];
            tokens.push(key ? { input: key, shape: part === '%b' ? 'boolean' : 'round' } : { missing: part });
            continue;
          }
          if (part.trim()) {
            tokens.push(part.trim());
          }
        }

        while (inputIndex < inputKeys.length) {
          tokens.push({ input: inputKeys[inputIndex++], shape: 'round' });
        }

        return this.renderSpecOpcode(node, { shape: 'command', category: 'custom', tokens });
    }

    renderSpecOpcode(node, spec) {
        if (spec.shape === 'hat') {
          return this.renderLinearBlock(node, spec.category, 'hat', spec.tokens);
        }
        if (spec.shape === 'reporter-round') {
          return this.renderLinearBlock(node, spec.category, 'round', spec.tokens);
        }
        if (spec.shape === 'reporter-boolean') {
          return this.renderLinearBlock(node, spec.category, 'boolean', spec.tokens);
        }
        if (spec.shape === 'cap') {
          return this.renderLinearBlock(node, spec.category, 'cap', spec.tokens);
        }
        return this.renderLinearBlock(node, spec.category, 'command', spec.tokens);
    }

    renderLinearBlock(node, category, shape, tokens) {
        const block = this.renderBlockShell(node, category, shape);
        this.appendTokens(block, node, tokens);
        return block;
    }

    renderCBlock(node, category, sections, mode = 'c-block') {
        const block = this.el('div', 'bfv-c-block');
        block.dataset.nodeKind = 'opcode';
        block.dataset.opcode = node.opcode;
        block.dataset.blockShape = mode === 'command-like' ? 'command-block' : 'c-block';
        block.dataset.blockId = node.id;
        block.dataset.blockCategory = category;
        this.addCategoryClass(block, category);

        for (const section of sections) {
          const header = this.el('div', `bfv-c-block-header${section.middle ? ' bfv-c-block-middle' : ''}`);
          this.addCategoryClass(header, category);
          this.appendTokens(header, node, section.tokens);
          block.appendChild(header);

          if (section.stack) {
            const mouth = this.el('div', 'bfv-c-block-mouth');
            mouth.dataset.nodeKind = 'substack';
            mouth.dataset.substackName = section.stack;
            this.addCategoryClass(mouth, category);
            mouth.appendChild(this.renderStack(node.stacks && node.stacks[section.stack] ? node.stacks[section.stack] : { type: 'stack', children: [] }));
            block.appendChild(mouth);
          }
        }

        return block;
    }

    appendTokens(container, node, tokens) {
        for (const token of tokens || []) {
          if (typeof token === 'string') {
            container.appendChild(this.el('span', 'bfv-label', token));
            continue;
          }

          if (token.field) {
            container.appendChild(this.renderFieldSlot(token.field, this.getFieldValue(node, token.field)));
            continue;
          }

          if (token.input) {
            container.appendChild(this.renderInputSlot(node, token.input, token.shape || 'round'));
            continue;
          }

          if (token.slot) {
            container.appendChild(this.renderSlotToken(node, token.slot, token.shape || 'round'));
            continue;
          }

          if (token.missing) {
            container.appendChild(this.renderMissingInput(token.missing));
          }
        }
    }

    renderSlotToken(node, names, shape) {
        for (const name of names) {
          if (node.inputs && node.inputs[name]) {
            return this.renderInputSlot(node, name, shape);
          }
          if (node.fields && Object.prototype.hasOwnProperty.call(node.fields, name)) {
            return this.renderFieldSlot(name, node.fields[name]);
          }
        }
        return this.renderMissingInput(Array.isArray(names) ? names[0] : names);
    }

    getFieldValue(node, name) {
        if (node.fields && Object.prototype.hasOwnProperty.call(node.fields, name)) {
          return node.fields[name];
        }
        return '';
    }

    renderGenericScratchOpcode(node) {
        const category = this.inferCategory(node.opcode);
        if (!category) return null;
        return this.renderGenericKnownOpcode(node, category, this.inferShape(node.opcode));
    }

    renderGenericKnownOpcode(node, category, shape) {
        const block = this.renderBlockShell(node, category, shape);
        const friendly = String(node.opcode).split('_').slice(1).join(' ') || node.opcode;
        block.appendChild(this.el('span', 'bfv-label', friendly));

        for (const key of Object.keys(node.fields || {}).sort()) {
          block.appendChild(this.renderFieldSlot(key, node.fields[key]));
        }

        for (const key of Object.keys(node.inputs || {}).sort()) {
          block.appendChild(this.renderInputSlot(node, key, 'round'));
        }

        if ((shape === 'command' || shape === 'cap') && Object.keys(node.stacks || {}).length) {
          return this.renderCBlock(node, category, [
            {
              tokens: [friendly]
                .concat(Object.keys(node.fields || {}).sort().map(key => ({ field: key })))
                .concat(Object.keys(node.inputs || {}).sort().map(key => ({ input: key, shape: 'round' }))),
              stack: Object.keys(node.stacks || {}).sort()[0]
            }
          ]);
        }

        return block;
    }

    inferCategory(opcode) {
        if (typeof opcode !== 'string') return null;
        if (opcode.startsWith('motion_')) return 'motion';
        if (opcode.startsWith('looks_')) return 'looks';
        if (opcode.startsWith('sound_')) return 'sound';
        if (opcode.startsWith('event') || opcode.startsWith('events_')) return 'events';
        if (opcode.startsWith('control_')) return 'control';
        if (opcode.startsWith('sensing_')) return 'sensing';
        if (opcode.startsWith('operator_')) return 'operators';
        if (opcode.startsWith('data_')) return 'data';
        if (opcode.startsWith('pen_')) return 'pen';
        if (opcode.startsWith('procedures_') || opcode.startsWith('argument_')) return 'custom';
        return null;
    }

    inferShape(opcode) {
        if (opcode === 'control_delete_this_clone') return 'cap';
        if (opcode.startsWith('events_when') || opcode === 'control_start_as_clone') return 'hat';
        if (opcode.startsWith('operator_') || opcode === 'data_variable') return 'round';
        if (
          opcode === 'sensing_touchingobject' ||
          opcode === 'sensing_touchingcolor' ||
          opcode === 'sensing_coloristouchingcolor' ||
          opcode === 'sensing_keypressed' ||
          opcode === 'sensing_mousedown' ||
          opcode === 'data_listcontainsitem'
        ) return 'boolean';
        return 'command';
    }

    renderLiteral(node, context = null) {
        const literal = this.el('span', 'bfv-literal-slot');
        literal.dataset.nodeKind = 'literal';
        literal.dataset.literalType = node.valueType;
        literal.textContent = String(node.value);
        return literal;
    }

    renderMenu(node, context = null) {
        const menu = this.el('span', 'bfv-menu-slot');
        menu.dataset.nodeKind = 'menu';
        menu.dataset.menuOpcode = node.menuOpcode;
        menu.textContent = String(node.value);
        return menu;
    }

    renderEmptyStack() {
        const empty = this.el('div', 'bfv-empty-stack', '[empty stack]');
        empty.dataset.nodeKind = 'empty-stack';
        return empty;
    }

    renderMissingInput(name) {
        const missing = this.el('span', 'bfv-missing-input', '?');
        missing.dataset.nodeKind = 'missing-input';
        missing.dataset.inputName = name;
        return missing;
    }

    renderUnknownOpcode(node) {
        return this.renderGenericKnownOpcode(node, 'custom', 'command');
    }

    renderUnknown(typeName) {
        const unknown = this.el('div', 'bfv-unknown', `[unsupported node: ${typeName}]`);
        unknown.dataset.nodeKind = 'unknown';
        return unknown;
    }

    renderBlockShell(node, category, shape) {
        let className = 'bfv-command-block';
        let blockShape = 'command-block';
        if (shape === 'round') {
          className = 'bfv-round-block';
          blockShape = 'round-block';
        } else if (shape === 'boolean') {
          className = 'bfv-boolean-block';
          blockShape = 'boolean-block';
        } else if (shape === 'hat') {
          className = 'bfv-hat-block';
          blockShape = 'hat-block';
        } else if (shape === 'cap') {
          className = 'bfv-cap-block';
          blockShape = 'cap-block';
        }

        const block = this.el('div', className);
        block.dataset.nodeKind = 'opcode';
        block.dataset.opcode = node.opcode;
        block.dataset.blockShape = blockShape;
        block.dataset.blockId = node.id;
        block.dataset.blockCategory = category;
        this.addCategoryClass(block, category);
        return block;
    }

    renderFieldSlot(name, value) {
        const field = this.el('span', 'bfv-field-slot');
        field.dataset.fieldName = name;
        field.textContent = value !== undefined && value !== null ? String(value) : '';
        return field;
    }

    renderInputSlot(node, inputName, shape) {
        const className = shape === 'boolean'
          ? 'bfv-input-slot bfv-input-slot-boolean'
          : 'bfv-input-slot bfv-input-slot-round';
        const slot = this.el('span', className);
        slot.dataset.nodeKind = 'input';
        slot.dataset.inputName = inputName;

        if (node.inputs && node.inputs[inputName]) {
          slot.appendChild(this.renderNode(node.inputs[inputName], shape));
        } else {
          slot.appendChild(this.renderMissingInput(inputName));
        }

        return slot;
    }

    addCategoryClass(node, category) {
        if (!node || !category) return;
        const suffix = ` bfv-cat-${category}`;
        node.className = `${node.className || ''}${suffix}`.trim();
    }

    el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }
    }

  function injectVisualStyles() {
        if (document.getElementById('bfv-styles')) return;

        const style = document.createElement('style');
        style.id = 'bfv-styles';
        style.textContent = `
            .bfv-procedure-shell {
            color: #fff;
            font-family: Arial, sans-serif;
            }

            .bfv-cat-motion { --bfv-block-color: #4c97ff; }
            .bfv-cat-looks { --bfv-block-color: #9966ff; }
            .bfv-cat-sound { --bfv-block-color: #cf63cf; }
            .bfv-cat-events { --bfv-block-color: #ffbf00; }
            .bfv-cat-control { --bfv-block-color: #ffab19; }
            .bfv-cat-sensing { --bfv-block-color: #5cb1d6; }
            .bfv-cat-operators { --bfv-block-color: #59c059; }
            .bfv-cat-data { --bfv-block-color: #ff8c1a; }
            .bfv-cat-pen { --bfv-block-color: #0fbd8c; }
            .bfv-cat-custom { --bfv-block-color: #ff6680; }

            .bfv-procedure-header {
            margin-bottom: 10px;
            }

            .bfv-scratch-workspace {
            width: 100%;
            min-height: 200px;
            border-radius: 8px;
            overflow: hidden;
            background: #fff;
            }

            .bfv-procedure-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            }

            .bfv-procedure-body {
            display: block;
            }

            .bfv-stack {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            }

            .bfv-empty-stack {
            font: 11px monospace;
            color: #ccc;
            border: 1px dashed #666;
            border-radius: 6px;
            padding: 4px 8px;
            background: rgba(255,255,255,0.04);
            }

            .bfv-command-block,
            .bfv-cap-block,
            .bfv-hat-block,
            .bfv-c-block-header,
            .bfv-c-block-mouth {
            background: var(--bfv-block-color, #4c5cc5);
            color: #fff;
            box-sizing: border-box;
            }

            .bfv-command-block,
            .bfv-cap-block,
            .bfv-hat-block {
            min-height: 34px;
            padding: 7px 12px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
            }

            .bfv-command-block {
            border-radius: 10px;
            }

            .bfv-hat-block {
            border-radius: 16px 16px 10px 10px;
            padding-top: 10px;
            }

            .bfv-cap-block {
            border-radius: 10px 10px 16px 16px;
            }

            .bfv-c-block {
            display: inline-flex;
            flex-direction: column;
            align-items: flex-start;
            color: #fff;
            }

            .bfv-c-block-header {
            min-height: 34px;
            padding: 7px 12px;
            border-radius: 10px 10px 0 0;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 220px;
            box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
            }

            .bfv-c-block-mouth {
            margin-left: 22px;
            padding: 8px 10px 10px 10px;
            border-radius: 0 0 10px 10px;
            min-width: 180px;
            box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
            }

            .bfv-label {
            font-size: 14px;
            font-weight: 700;
            line-height: 1;
            white-space: nowrap;
            }

            .bfv-field-slot {
            display: inline-flex;
            align-items: center;
            min-height: 22px;
            padding: 0 8px;
            border-radius: 7px;
            background: rgba(255,255,255,0.18);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            }

            .bfv-input-slot {
            display: inline-flex;
            align-items: center;
            justify-content: flex-start;
            min-height: 24px;
            padding: 2px 4px;
            background: rgba(0,0,0,0.18);
            box-sizing: border-box;
            }

            .bfv-input-slot-round {
            border-radius: 999px;
            min-width: 34px;
            }

            .bfv-input-slot-boolean {
            border-radius: 999px;
            min-width: 60px;
            }

            .bfv-boolean-block {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 22px;
            padding: 0 10px;
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            white-space: nowrap;
            box-sizing: border-box;
            border-radius: 999px;
            background: var(--bfv-block-color, rgba(255,255,255,0.16));
            color: #fff;
            box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
            }

            .bfv-round-block {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 24px;
            padding: 2px 10px;
            border-radius: 999px;
            background: var(--bfv-block-color, #59c059);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            white-space: nowrap;
            box-sizing: border-box;
            box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
            }

            .bfv-c-block-middle {
            border-radius: 0;
            margin-left: 22px;
            min-width: 180px;
            }

            .bfv-literal-slot,
            .bfv-menu-slot {
            display: inline-flex;
            align-items: center;
            min-height: 20px;
            padding: 0 8px;
            border-radius: 999px;
            background: #1f1f1f;
            color: #fff;
            font-size: 12px;
            line-height: 1;
            white-space: nowrap;
            }

            .bfv-missing-input {
            display: inline-flex;
            align-items: center;
            min-height: 20px;
            padding: 0 8px;
            border-radius: 999px;
            background: rgba(255,255,255,0.1);
            color: #ddd;
            font-size: 12px;
            line-height: 1;
            }

            .bfv-unknown,
            .bfv-unknown-opcode {
            display: inline-block;
            padding: 6px 8px;
            border-radius: 8px;
            background: #5a2a2a;
            color: #fff;
            font: 12px monospace;
            }
        `;
        document.head.appendChild(style);
        }

  async function readClipboardText() {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        return String(await navigator.clipboard.readText() || '');
      }
    } catch {
      return '';
    }
    return '';
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(String(text || ''));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function makeFloatingPanel(id, titleText) {
    const old = document.getElementById(id);
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = id;
    panel.style.cssText = [
      'position:fixed',
      'top:24px',
      'right:24px',
      'width:min(720px,76vw)',
      'height:min(520px,70vh)',
      'background:#181818',
      'border:1px solid #555',
      'border-radius:12px',
      'box-shadow:0 16px 40px rgba(0,0,0,.45)',
      'z-index:999999',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
      'resize:both'
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:12px',
      'padding:10px 12px',
      'background:#222',
      'border-bottom:1px solid #444',
      'cursor:move',
      'user-select:none'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = titleText;
    title.style.cssText = 'color:#fff;font:bold 14px sans-serif';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:8px;align-items:center';

    const makeBtn = (txt, fn) => {
      const btn = document.createElement('button');
      btn.textContent = txt;
      btn.onclick = fn;
      btn.style.cssText = [
        'padding:6px 10px',
        'border-radius:8px',
        'border:1px solid #666',
        'background:#2d2d2d',
        'color:white',
        'cursor:pointer'
      ].join(';');
      return btn;
    };

    const closeBtn = makeBtn('Close', () => panel.remove());
    controls.append(closeBtn);
    header.append(title, controls);

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = event => {
      if (!dragging) return;
      panel.style.left = `${Math.max(0, event.clientX - offsetX)}px`;
      panel.style.top = `${Math.max(0, event.clientY - offsetY)}px`;
      panel.style.right = 'auto';
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    header.onmousedown = event => {
      dragging = true;
      offsetX = event.clientX - (panel.offsetLeft || 0);
      offsetY = event.clientY - (panel.offsetTop || 0);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const body = document.createElement('div');
    body.style.cssText = [
      'flex:1',
      'display:flex',
      'flex-direction:column',
      'min-height:0',
      'padding:10px',
      'gap:10px',
      'background:#111'
    ].join(';');

    panel.append(header, body);
    document.body.appendChild(panel);

    return { panel, body, controls, makeBtn };
  }

  function showClipboardPreview(owner, irText) {
    injectVisualStyles();
    const { panel, body, controls, makeBtn } = makeFloatingPanel(
      'blockify-phase1-preview',
      'Blockify Clipboard Preview'
    );

    owner.setBufferText(irText);
    owner.validateIR({ IR: irText });
    owner.renderIR({ IR: irText });

    const visual = document.createElement('div');
    visual.dataset.viewportFill = 'true';
    visual.style.cssText = [
      'flex:1',
      'min-height:0',
      'overflow:auto',
      'background:#f3f3f3',
      'border:1px solid #666',
      'border-radius:8px',
      'padding:0'
    ].join(';');

    const openEditorBtn = makeBtn('Open Editor', () => {
      showEditor(owner);
    });
    if (typeof controls.insertBefore === 'function') {
      controls.insertBefore(openEditorBtn, controls.firstChild || null);
    } else {
      controls.appendChild(openEditorBtn);
    }

    body.appendChild(visual);
    refreshVisualPreview(owner, visual, irText);

    return panel;
  }

  async function openClipboardPreviewFromClipboard(owner) {
    const text = (await readClipboardText()).trim();
    if (!text) {
      owner.lastError = 'Clipboard does not contain Blockify IR';
      owner.lastRender = '';
      owner.lastVisualRenderMode = '';
      owner.lastVisualRenderError = '';
      return false;
    }

    owner.lastError = '';
    showClipboardPreview(owner, text);
    return true;
  }

  function showEditor(owner) {
    const old = document.getElementById('blockify-phase1-editor');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'blockify-phase1-editor';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,.65)',
      'z-index:999999',
      'display:flex',
      'align-items:flex-start',
      'justify-content:center',
      'padding:16px 0',
      'overflow:auto'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'width:min(1000px,92vw)',
      'height:min(760px,86vh)',
      'max-height:calc(100vh - 32px)',
      'background:#1e1e1e',
      'border:2px solid #888',
      'border-radius:12px',
      'padding:16px',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
      'overflow:hidden'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Blockify Phase 1.5 IR Editor';
    title.style.cssText = 'color:white;font:bold 18px sans-serif';

    const content = document.createElement('div');
    content.style.cssText = [
      'flex:1',
      'min-height:0',
      'overflow:auto',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
      'padding-right:4px'
    ].join(';');

    const buffers = document.createElement('div');
    buffers.style.cssText = [
      'display:grid',
      'grid-template-columns:1fr 1fr',
      'gap:12px',
      'min-height:220px',
      'max-height:360px',
      'flex-shrink:0'
    ].join(';');

    const makePane = (labelText, value, color) => {
      const pane = document.createElement('div');
      pane.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:0';

      const label = document.createElement('div');
      label.textContent = labelText;
      label.style.cssText = 'color:white;font:bold 13px sans-serif';

      const textarea = document.createElement('textarea');
      textarea.value = value || '';
      textarea.style.cssText = [
        'flex:1',
        'width:100%',
        'resize:none',
        'background:#111',
        `color:${color}`,
        'border:1px solid #666',
        'border-radius:8px',
        'padding:12px',
        'font:13px monospace',
        'white-space:pre'
      ].join(';');

      pane.append(label, textarea);
      return { pane, textarea };
    };

    const sourcePane = makePane('Source IR', owner.irBuffer || '', '#0f0');
    const patchPane = makePane('Patch JSON', owner.patchBuffer || '', '#8bd6ff');
    buffers.append(sourcePane.pane, patchPane.pane);

    const status = document.createElement('pre');
    status.style.cssText = [
      'margin:0',
      'min-height:96px',
      'max-height:180px',
      'overflow:auto',
      'background:#111',
      'color:#ddd',
      'border:1px solid #666',
      'border-radius:8px',
      'padding:12px',
      'font:12px monospace',
      'white-space:pre-wrap',
      'flex-shrink:0'
    ].join(';');

    const refreshStatus = () => {
      updateEditorPreviewState(owner, visual, sourcePane.textarea.value);
      status.textContent = buildEditorStatusText(owner);
      patchedOutput.value = owner.lastPatchedIR || '';
    };

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;flex-shrink:0';

    const makeBtn = (txt, fn) => {
      const btn = document.createElement('button');
      btn.textContent = txt;
      btn.onclick = fn;
      btn.style.cssText = [
        'padding:8px 14px',
        'border-radius:8px',
        'border:1px solid #666',
        'background:#2d2d2d',
        'color:white',
        'cursor:pointer'
      ].join(';');
      return btn;
    };

    const applyBtn = makeBtn('Apply to Buffer', () => {
      owner.setBufferText(sourcePane.textarea.value);
      refreshStatus();
    });

    const copyBtn = makeBtn('Copy Buffer', async () => {
      try {
        await navigator.clipboard.writeText(sourcePane.textarea.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Buffer';
        }, 1200);
      } catch {
        sourcePane.textarea.focus();
        sourcePane.textarea.select();
        sourcePane.textarea.setSelectionRange(0, sourcePane.textarea.value.length);
        try {
          document.execCommand('copy');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Buffer';
          }, 1200);
        } catch {
          copyBtn.textContent = 'Copy Failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Buffer';
          }, 1200);
        }
      }
    });

    const clearBtn = makeBtn('Clear Buffer', () => {
      sourcePane.textarea.value = '';
      owner.setBufferText('');
      owner.lastError = '';
      owner.lastRender = '';
      owner.lastVisualRenderMode = '';
      owner.lastVisualRenderError = '';
      refreshStatus();
      sourcePane.textarea.focus();
    });

    const applyPatchBtn = makeBtn('Apply Patch', () => {
      owner.setBufferText(sourcePane.textarea.value);
      owner.setPatchBuffer({ PATCH: patchPane.textarea.value });
      owner.applyPatchBufferToIRBuffer();
      refreshStatus();
    });

    const copyPatchedBtn = makeBtn('Copy Patched IR', async () => {
      const ok = await owner.copyLastPatchedIRToClipboard();
      copyPatchedBtn.textContent = ok ? 'Copied!' : 'No Patched IR';
      setTimeout(() => {
        copyPatchedBtn.textContent = 'Copy Patched IR';
      }, 1200);
    });

    const usePatchedBtn = makeBtn('Use Patched As Source', () => {
      if (!owner.lastPatchedIR) return;
      sourcePane.textarea.value = owner.lastPatchedIR;
      owner.setBufferText(owner.lastPatchedIR);
      refreshStatus();
    });

    const validateBtn = makeBtn('Validate Buffer', () => {
      owner.setBufferText(sourcePane.textarea.value);
      owner.validateIR({ IR: owner.irBuffer });
      refreshStatus();
    });

    const renderBtn = makeBtn('Render Buffer', () => {
      owner.setBufferText(sourcePane.textarea.value);
      owner.renderIR({ IR: owner.irBuffer });
      refreshStatus();
    });

    const closeBtn = makeBtn('Close', () => overlay.remove());

    row.append(applyBtn, copyBtn, clearBtn, applyPatchBtn, copyPatchedBtn, usePatchedBtn, validateBtn, renderBtn, closeBtn);
    const patchedOutput = document.createElement('textarea');
    patchedOutput.value = owner.lastPatchedIR || '';
    patchedOutput.readOnly = true;
    patchedOutput.style.cssText = [
      'width:100%',
      'min-height:110px',
      'max-height:180px',
      'resize:vertical',
      'background:#0f1115',
      'color:#ffd37a',
      'border:1px solid #666',
      'border-radius:8px',
      'padding:12px',
      'font:13px monospace',
      'white-space:pre',
      'flex-shrink:0'
    ].join(';');

    const patchedLabel = document.createElement('div');
    patchedLabel.textContent = 'Patched IR Result';
    patchedLabel.style.cssText = 'color:white;font:bold 13px sans-serif';

    const visual = document.createElement('div');
    visual.style.cssText = [
      'min-height:120px',
      'height:240px',
      'overflow:auto',
      'background:#111',
      'border:1px solid #666',
      'border-radius:8px',
      'padding:8px',
      'flex-shrink:0'
    ].join(';');

    content.append(buffers, status, patchedLabel, patchedOutput, visual);
    panel.append(title, content, row);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    refreshStatus();
  }

  class BlockifyPhase1 {
    constructor() {
      this.lastError = '';
      this.lastRender = '';
      this.lastVisualRenderMode = '';
      this.lastVisualRenderError = '';
      this.irBuffer = '';
      this.patchBuffer = '';
      this.lastPatchedIR = '';
      this.lastPatchError = '';
    }

    setBufferText(text) {
      this.irBuffer = String(text || '');
      this.resetPatchedState();
    }

    resetPatchedState() {
      this.lastPatchedIR = '';
      this.lastPatchError = '';
    }

    getInfo() {
      return {
        id: 'blockifyphase1',
        name: 'Blockify Phase 1',
        color1: '#5b6ee1',
        color2: '#4c5cc5',
        blocks: [
          {
            blockType: Scratch.BlockType.BUTTON,
            text: 'Blockify Clipboard IR',
            func: 'openClipboardPreviewButton'
          },
          {
            opcode: 'validateIR',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'validate Blockify IR [IR]',
            arguments: {
              IR: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          {
            opcode: 'renderIR',
            blockType: Scratch.BlockType.REPORTER,
            text: 'render Blockify IR [IR]',
            arguments: {
              IR: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          {
            opcode: 'setIRBuffer',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set Blockify IR buffer [IR]',
            arguments: {
              IR: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          {
            opcode: 'setPatchBuffer',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set Blockify patch buffer [PATCH]',
            arguments: {
              PATCH: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          {
            opcode: 'editIRBuffer',
            blockType: Scratch.BlockType.COMMAND,
            text: 'open Blockify IR editor'
          },
          {
            opcode: 'blockifyClipboardText',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'blockify clipboard text'
          },
          {
            opcode: 'validateIRBuffer',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'validate Blockify IR buffer'
          },
          {
            opcode: 'renderIRBuffer',
            blockType: Scratch.BlockType.REPORTER,
            text: 'render Blockify IR buffer'
          },
          {
            opcode: 'getIRBuffer',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Blockify IR buffer'
          },
          {
            opcode: 'getPatchBuffer',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Blockify patch buffer'
          },
          {
            opcode: 'applyPatchBufferToIRBuffer',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'apply Blockify patch buffer to IR buffer'
          },
          {
            opcode: 'getLastPatchedIR',
            blockType: Scratch.BlockType.REPORTER,
            text: 'last Blockify patched IR'
          },
          {
            opcode: 'getLastPatchError',
            blockType: Scratch.BlockType.REPORTER,
            text: 'last Blockify patch error'
          },
          {
            opcode: 'copyLastPatchedIRToClipboard',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'copy last Blockify patched IR to clipboard'
          },
          {
            opcode: 'getLastError',
            blockType: Scratch.BlockType.REPORTER,
            text: 'last Blockify error'
          }
        ]
      };
    }

    validateIR(args) {
      if (!args.IR || !String(args.IR).trim()) {
        this.lastError = 'IR input is empty';
        this.lastRender = '';
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        return false;
      }
      try {
        this.lastError = '';
        this.lastRender = '';
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        const parser = new Parser(args.IR);
        parser.parse();
        return true;
      } catch (err) {
        this.lastError = err && err.message ? err.message : String(err);
        this.lastRender = '';
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        return false;
      }
    }

    renderIR(args) {
      if (!args.IR || !String(args.IR).trim()) {
        this.lastError = 'IR input is empty';
        this.lastRender = '';
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        return 'ERROR: IR input is empty';
      }
      try {
        this.lastError = '';
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        const parser = new Parser(args.IR);
        const procedure = parser.parse();
        this.lastRender = Renderer.renderProcedure(procedure);
        return this.lastRender;
      } catch (err) {
        this.lastRender = '';
        this.lastError = err && err.message ? err.message : String(err);
        this.lastVisualRenderMode = '';
        this.lastVisualRenderError = '';
        return `ERROR: ${this.lastError}`;
      }
    }

    setIRBuffer(args) {
      this.setBufferText(args.IR);
    }

    setPatchBuffer(args) {
      this.patchBuffer = String(args.PATCH || '');
    }

    openClipboardPreviewButton() {
      return openClipboardPreviewFromClipboard(this);
    }

    editIRBuffer() {
      showEditor(this);
    }

    blockifyClipboardText() {
      return openClipboardPreviewFromClipboard(this);
    }

    applyPatchBufferToIRBuffer() {
      const result = applyPatchJsonToIR(this.irBuffer, this.patchBuffer);
      if (!result.ok) {
        this.lastPatchError = result.error || 'Failed to apply patch';
        return false;
      }

      this.lastPatchedIR = result.ir || '';
      this.lastPatchError = '';
      return true;
    }

    validateIRBuffer() {
      return this.validateIR({ IR: this.irBuffer });
    }

    renderIRBuffer() {
      return this.renderIR({ IR: this.irBuffer });
    }

    getIRBuffer() {
      return this.irBuffer || '';
    }

    getPatchBuffer() {
      return this.patchBuffer || '';
    }

    getLastPatchedIR() {
      return this.lastPatchedIR || '';
    }

    getLastPatchError() {
      return this.lastPatchError || '';
    }

    async copyLastPatchedIRToClipboard() {
      if (!this.lastPatchedIR) {
        return false;
      }
      return copyTextToClipboard(this.lastPatchedIR);
    }

    getLastError() {
      return this.lastError || '';
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__blockifyTestHooks = {
      Parser,
      Renderer,
      VisualRenderer,
      serializeAst,
      applyProjectPatch,
      applyPatchToIR,
      applyPatchJsonToIR,
      astToScratchBlocksXml,
      ensureScratchBlocksReady,
      runEmbeddedWorkspaceLayoutPass,
      renderProcedureWithScratchBlocks,
      readClipboardText,
      showClipboardPreview,
      openClipboardPreviewFromClipboard,
      showEditor,
      updateEditorPreviewState,
      getPreferredPreviewIR,
      buildEditorStatusText,
      refreshVisualPreview
    };
  }

  Scratch.extensions.register(new BlockifyPhase1());
})(Scratch);
