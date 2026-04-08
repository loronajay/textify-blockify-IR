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

  function getLastExportedIR() {
    const shared = globalThis.__TB2_SHARED__ || null;
    if (!shared) return '';
    return typeof shared.lastExportText === 'string' ? shared.lastExportText : '';
  }

  function hasValidExportedIR() {
    const text = getLastExportedIR().trim();
    return text.startsWith('[procedure') || text.startsWith('[script') ||
           text.startsWith('[stack') || text.startsWith('[opcode');
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

    stripHeaderComments() {
      while (this.i < this.n && this.text[this.i] === '#') {
        while (this.i < this.n && this.text[this.i] !== '\n') this.i++;
        if (this.i < this.n) this.i++;
      }
    }

    parse() {
      this.stripHeaderComments();
      this.skipWS();
      const node = this.parseBracketNode();
      this.skipWS();
      if (this.i !== this.n) {
        throw new ParseError(`Unexpected trailing content at index ${this.i}`);
      }
      if (!node) {
        throw new ValidationError('Root node must be procedure, script, stack, or opcode');
      }
      let root = node;
      if (node.type === 'opcode') {
        root = { type: 'script', body: { type: 'stack', children: [node] } };
      } else if (node.type === 'stack') {
        root = { type: 'script', body: node };
      } else if (node.type !== 'procedure' && node.type !== 'script') {
        throw new ValidationError('Root node must be procedure, script, stack, or opcode');
      }
      this.validateRoot(root);
      return root;
    }

    parseAll() {
      this.stripHeaderComments();
      const roots = [];
      this.skipWS();
      while (this.i < this.n) {
        const node = this.parseBracketNode();
        if (!node) break;
        let root = node;
        if (node.type === 'opcode') {
          root = { type: 'script', body: { type: 'stack', children: [node] } };
        } else if (node.type === 'stack') {
          root = { type: 'script', body: node };
        } else if (node.type !== 'procedure' && node.type !== 'script') {
          throw new ValidationError('Root node must be procedure, script, stack, or opcode');
        }
        this.validateRoot(root);
        roots.push(root);
        this.skipWS();
      }
      return roots;
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
          if (this.peek(']')) { this.i += 1; return items; } // trailing comma
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
        if (this.peek(',')) this.i += 1; // optional comma separator
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
        if (this.peek(',')) this.i += 1; // optional comma separator
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
        if (this.peek(',')) this.i += 1; // optional comma separator
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
        if (ch === '\n' || ch === '\r' || ch === ']' || ch === ' ' || ch === '\t') {
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
        if (this.peek(',')) { this.i += 1; this.skipWS(); } // optional comma between properties
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
        if (this.peek(',')) { this.i += 1; this.skipWS(); } // optional comma between properties
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
        if (this.peek(',')) { this.i += 1; this.skipWS(); } // optional comma between properties
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
        this.skipWS();
        if (this.i < this.n && this.text[this.i] !== '"') {
          // Recover from unquoted string literal (e.g. [literal:string:hello world])
          const start = this.i;
          while (this.i < this.n && this.text[this.i] !== ']' && this.text[this.i] !== '\n' && this.text[this.i] !== '\r') {
            this.i += 1;
          }
          value = this.text.slice(start, this.i).trimEnd();
        } else {
          value = this.parseString();
        }
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

    operator_add: { shape: 'reporter-round', category: 'operators', tokens: [{ slot: ['NUM1', 'OPERAND1'], shape: 'round' }, '+', { slot: ['NUM2', 'OPERAND2'], shape: 'round' }] },
    operator_subtract: { shape: 'reporter-round', category: 'operators', tokens: [{ slot: ['NUM1', 'OPERAND1'], shape: 'round' }, '-', { slot: ['NUM2', 'OPERAND2'], shape: 'round' }] },
    operator_multiply: { shape: 'reporter-round', category: 'operators', tokens: [{ slot: ['NUM1', 'OPERAND1'], shape: 'round' }, '*', { slot: ['NUM2', 'OPERAND2'], shape: 'round' }] },
    operator_divide: { shape: 'reporter-round', category: 'operators', tokens: [{ slot: ['NUM1', 'OPERAND1'], shape: 'round' }, '/', { slot: ['NUM2', 'OPERAND2'], shape: 'round' }] },
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
    argument_reporter_boolean: { shape: 'reporter-boolean', category: 'custom', tokens: [{ field: 'VALUE' }] },

    blockify2_editIRBuffer: { shape: 'command', category: 'custom', tokens: ['open Blockify IR editor'] },
    blockify2_loadClipboardIR: { shape: 'command', category: 'custom', tokens: ['Blockify clipboard contents'] },
    blockify2_commitIR: { shape: 'command', category: 'custom', tokens: ['commit IR from clipboard'] },
    blockify2_proposeIR: { shape: 'command', category: 'custom', tokens: ['propose IR from clipboard'] },
    blockify2_approveIR: { shape: 'command', category: 'custom', tokens: ['approve pending IR'] },
    blockify2_rejectIR: { shape: 'command', category: 'custom', tokens: ['reject pending IR'] },
    blockify2_undoCommit: { shape: 'command', category: 'custom', tokens: ['undo last Blockify commit'] },
    blockify2_hasPendingIR: { shape: 'reporter-boolean', category: 'custom', tokens: ['IR pending?'] },
    blockify2_readClipboard: { shape: 'reporter-round', category: 'custom', tokens: ['clipboard contents'] },
    blockify2_getLastError: { shape: 'reporter-round', category: 'custom', tokens: ['last Blockify error'] },

    textifyturbowarp_getExportedIR: { shape: 'reporter-round', category: 'custom', tokens: ['clipboard IR'] },
    textifyturbowarp_copyRulesWithClipboardIR: { shape: 'command', category: 'custom', tokens: ['merge rules with clipboard IR'] },
    textifyturbowarp_textifyClickedBlock: { shape: 'command', category: 'custom', tokens: ['Textify clicked block'] },
    textifyturbowarp_copyAllStacksPlain: { shape: 'command', category: 'custom', tokens: ['copy all stacks from sprite', { input: 'SPRITE', shape: 'round' }, 'without rules'] }
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
    sensing_of_object_menu: 'OBJECT',
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
    sensing_of_object_menu: { fieldName: 'OBJECT', categoryExtension: 'colours_sensing' },
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

    if (node.type === 'procedure' || node.type === 'script') {
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

  function proccodArgTypes(proccode) {
    const types = [];
    const re = /%(s|n|b)/g;
    let m;
    while ((m = re.exec(proccode || '')) !== null) {
      types.push(m[1] === 'b' ? 'boolean' : 'string_number');
    }
    return types;
  }

  function procedureMutationXml(node) {
    const argumentnames = node.argumentnames || [];
    const argumentIds = defaultArgumentIds(argumentnames);
    const argTypes = proccodArgTypes(node.proccode);
    const mutation = `<mutation proccode="${escapeXmlAttr(node.proccode || '')}" argumentids="${escapeXmlAttr(JSON.stringify(argumentIds))}" argumentnames="${escapeXmlAttr(JSON.stringify(argumentnames))}" argumentdefaults="${escapeXmlAttr(JSON.stringify(node.argumentdefaults || []))}" warp="${node.warp ? 'true' : 'false'}"></mutation>`;
    const argSlots = argumentIds.map((argId, i) => {
      const argName = argumentnames[i] || '';
      const reporterType = argTypes[i] === 'boolean' ? 'argument_reporter_boolean' : 'argument_reporter_string_number';
      return `<value name="${escapeXmlAttr(argId)}"><shadow type="${reporterType}"><field name="VALUE">${escapeXmlText(argName)}</field></shadow></value>`;
    }).join('');
    return mutation + argSlots;
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

  const OPERAND_TO_NUM_OPCODES = new Set([
    'operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide'
  ]);

  function resolveInputName(opcode, name) {
    if (!OPERAND_TO_NUM_OPCODES.has(opcode)) return name;
    if (name === 'OPERAND1') return 'NUM1';
    if (name === 'OPERAND2') return 'NUM2';
    return name;
  }

  function inputListXml(node) {
    const inputs = node.inputs || {};
    return Object.keys(inputs)
      .sort()
      .map(name => `<value name="${escapeXmlAttr(resolveInputName(node.opcode, name))}">${inputNodeXml(inputs[name])}</value>`)
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

  function astToScratchBlocksXmlMulti(nodes, margin = 400) {
    const allVars = new Map();
    let allBlocksXml = '';
    let xOffset = 0;
    for (const node of nodes) {
      for (const [key, variable] of collectDeclaredVariables(node)) {
        allVars.set(key, variable);
      }
      let blockXml;
      if (node.type === 'script') {
        blockXml = stackChainXml(node.body);
      } else {
        const bodyXml = stackChainXml(node.body);
        const nextXml = bodyXml ? `<next>${bodyXml}</next>` : '';
        blockXml = `<block type="procedures_definition"><statement name="custom_block"><block type="procedures_prototype">${procedureMutationXml(node)}</block></statement>${nextXml}</block>`;
      }
      // Inject x/y into the first top-level <block> element
      blockXml = blockXml.replace(/^<block\b/, `<block x="${xOffset}" y="0"`);
      allBlocksXml += blockXml;
      xOffset += margin;
    }
    const vars = Array.from(allVars.values()).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const allVarsXml = vars.length
      ? `<variables>${vars.map(v => `<variable type="${escapeXmlAttr(v.type)}" id="${escapeXmlAttr(variableIdFor(v.name, v.type))}">${escapeXmlText(v.name)}</variable>`).join('')}</variables>`
      : '';
    return `<xml xmlns="https://developers.google.com/blockly/xml">${allVarsXml}${allBlocksXml}</xml>`;
  }

  const SELF_EXTENSION_BLOCK_DEFS = [
    { opcode: 'blockify2_editIRBuffer',             text: 'open Blockify IR editor',                              shape: 'command'   },
    { opcode: 'blockify2_loadClipboardIR',          text: 'Blockify clipboard contents',                          shape: 'command'   },
    { opcode: 'blockify2_commitIR',                 text: 'commit IR from clipboard',                             shape: 'command'   },
    { opcode: 'blockify2_proposeIR',                text: 'propose IR from clipboard',                            shape: 'command'   },
    { opcode: 'blockify2_approveIR',                text: 'approve pending IR',                                   shape: 'command'   },
    { opcode: 'blockify2_rejectIR',                 text: 'reject pending IR',                                    shape: 'command'   },
    { opcode: 'blockify2_undoCommit',               text: 'undo last Blockify commit',                            shape: 'command'   },
    { opcode: 'blockify2_hasPendingIR',             text: 'IR pending?',                                          shape: 'reporter-boolean' },
    { opcode: 'blockify2_readClipboard',            text: 'clipboard contents',                                   shape: 'reporter'  },
    { opcode: 'blockify2_getLastError',             text: 'last Blockify error',                                  shape: 'reporter'  },
    { opcode: 'textifyturbowarp_getExportedIR',          text: 'clipboard IR',                                         shape: 'reporter'  },
    { opcode: 'textifyturbowarp_copyRulesWithClipboardIR', text: 'merge rules with clipboard IR',                      shape: 'command'   },
    { opcode: 'textifyturbowarp_textifyClickedBlock',    text: 'Textify clicked block',                                shape: 'command'   },
    { opcode: 'textifyturbowarp_copyAllStacksPlain',     text: 'copy all stacks from sprite %1 without rules',        shape: 'command', inputs: [{ type: 'input_value', name: 'SPRITE' }] }
  ];

  function registerSelfExtensionBlocks(scratchBlocks) {
    if (!scratchBlocks || !scratchBlocks.Blocks) return;
    for (const def of SELF_EXTENSION_BLOCK_DEFS) {
      if (scratchBlocks.Blocks[def.opcode] && typeof scratchBlocks.Blocks[def.opcode].init === 'function') continue;
      const isCommand = def.shape === 'command';
      const text = def.text;
      const inputs = def.inputs || null;
      scratchBlocks.Blocks[def.opcode] = {
        init: function () {
          if (typeof this.jsonInit === 'function') {
            const json = { message0: text };
            if (inputs) json.args0 = inputs;
            if (isCommand) { json.previousStatement = null; json.nextStatement = null; }
            else { json.output = 'String'; }
            this.jsonInit(json);
            return;
          }
          if (typeof this.appendDummyInput === 'function') this.appendDummyInput().appendField(text);
          if (isCommand) {
            if (typeof this.setPreviousStatement === 'function') this.setPreviousStatement(true);
            if (typeof this.setNextStatement === 'function') this.setNextStatement(true);
          } else {
            if (typeof this.setOutput === 'function') this.setOutput(true, 'String');
          }
        }
      };
    }
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
      registerSelfExtensionBlocks(scratchBlocks);

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

  function repositionMultipleStacks(workspace, topBlocks, gap) {
    if (!workspace || !topBlocks || topBlocks.length <= 1) return;
    gap = (gap === undefined || gap === null) ? 60 : gap;

    const sorted = topBlocks.slice().sort(function (a, b) {
      try {
        const pa = typeof a.getRelativeToSurfaceXY === 'function' ? a.getRelativeToSurfaceXY() : { x: 0 };
        const pb = typeof b.getRelativeToSurfaceXY === 'function' ? b.getRelativeToSurfaceXY() : { x: 0 };
        return pa.x - pb.x;
      } catch (e) { return 0; }
    });

    let xCursor = 20;
    for (const block of sorted) {
      if (typeof block.moveBy !== 'function') continue;

      // Measure width before moving (width is position-independent)
      let blockWidth = 200;
      try {
        if (typeof block.getBoundingRectangle === 'function') {
          const rect = block.getBoundingRectangle();
          if (rect != null && typeof rect.left === 'number' && typeof rect.right === 'number') {
            // scratch-blocks format: {top, bottom, left, right}
            blockWidth = Math.max(100, rect.right - rect.left);
          } else if (rect != null && rect.topLeft && rect.bottomRight) {
            // Blockly format: {topLeft: {x,y}, bottomRight: {x,y}}
            blockWidth = Math.max(100, rect.bottomRight.x - rect.topLeft.x);
          }
        }
        if (blockWidth === 200 && typeof block.getHeightWidth === 'function') {
          const hw = block.getHeightWidth();
          if (hw && hw.width) blockWidth = Math.max(100, hw.width);
        }
      } catch (e) { /* use default */ }

      // moveBy(dx, dy) — move relative to current position
      try {
        const pos = block.getRelativeToSurfaceXY();
        block.moveBy(xCursor - pos.x, 20 - pos.y);
      } catch (e) { /* skip unmovable blocks */ }

      xCursor += blockWidth + gap;
    }

    try {
      if (typeof workspace.resizeContents === 'function') workspace.resizeContents();
    } catch (e) { /* skip */ }
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

  // Get the Scratch blocks-media path from TurboWarp's own workspace so embedded
  // workspaces can load the same icons (green-flag.svg, repeat.svg, etc.).
  // Use globalThis['ScratchBlocks'] (bracket notation) so the bundler does not
  // substitute this reference with the embedded ScratchBlocks module.
  function getTurboWarpMediaPath() {
    try {
      const twScratchBlocks = typeof globalThis !== 'undefined' && globalThis['ScratchBlocks'];
      if (!twScratchBlocks || typeof twScratchBlocks.getMainWorkspace !== 'function') return null;
      const twWs = twScratchBlocks.getMainWorkspace();
      return (twWs && twWs.options && twWs.options.pathToMedia) || null;
    } catch {
      return null;
    }
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

      const twMediaPath = getTurboWarpMediaPath();
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
        },
        ...(twMediaPath ? { media: twMediaPath } : {})
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

  function renderMultipleWithScratchBlocks(root, nodes, scratchBlocks) {
    if (!root || !nodes || !nodes.length || !scratchBlocks || typeof scratchBlocks.inject !== 'function') {
      if (root && root.dataset) {
        root.dataset.renderMode = 'fallback';
        root.dataset.renderError = 'scratch-blocks unavailable';
      }
      return false;
    }

    try {
      ensureScratchBlocksReady(scratchBlocks);
      while (root.firstChild) root.removeChild(root.firstChild);

      const host = document.createElement('div');
      host.className = 'bfv-scratch-workspace';
      host.style.width = '100%';
      host.style.position = 'relative';
      if (root.dataset && root.dataset.viewportFill === 'true') {
        host.style.height = '100%';
        host.style.minHeight = '100%';
      } else {
        host.style.height = '400px';
        host.style.minHeight = '400px';
      }
      root.appendChild(host);

      const twMediaPath = getTurboWarpMediaPath();
      const workspace = scratchBlocks.inject(host, {
        readOnly: true,
        theme: createScratchPreviewTheme(),
        scratchTheme: scratchBlocks.ScratchBlocksTheme && scratchBlocks.ScratchBlocksTheme.CLASSIC
          ? scratchBlocks.ScratchBlocksTheme.CLASSIC
          : 'classic',
        scrollbars: true,
        trashcan: false,
        zoom: { controls: false, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.2 },
        move: { drag: true, wheel: true, scrollbars: true },
        ...(twMediaPath ? { media: twMediaPath } : {})
      });

      const textToDom =
        scratchBlocks.utils && scratchBlocks.utils.xml && typeof scratchBlocks.utils.xml.textToDom === 'function'
          ? scratchBlocks.utils.xml.textToDom
          : scratchBlocks.Xml && typeof scratchBlocks.Xml.textToDom === 'function'
            ? scratchBlocks.Xml.textToDom
            : null;

      if (!textToDom || !scratchBlocks.Xml || typeof scratchBlocks.Xml.domToWorkspace !== 'function') {
        throw new Error('scratch-blocks XML APIs unavailable');
      }

      const xmlText = astToScratchBlocksXmlMulti(nodes);
      const xmlDom = textToDom(xmlText);
      scratchBlocks.Xml.domToWorkspace(xmlDom, workspace);

      let topBlocks = [];
      if (typeof workspace.getTopBlocks === 'function') {
        topBlocks = workspace.getTopBlocks(false) || [];
      }
      runEmbeddedWorkspaceLayoutPass(workspace, scratchBlocks, topBlocks);
      repositionMultipleStacks(workspace, topBlocks);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          runEmbeddedWorkspaceLayoutPass(workspace, scratchBlocks, topBlocks);
          repositionMultipleStacks(workspace, topBlocks);
        });
      }

      const cssDiagnostics = getBlocklyStyleDiagnostics(document);
      if (root.dataset) {
        root.dataset.renderMode = 'embedded-multi';
        root.dataset.renderError = '';
        root.dataset.blockCount = String(topBlocks.length);
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
    const modeText = owner.lastVisualRenderMode ? `\n\nVISUAL MODE:\n${owner.lastVisualRenderMode}` : '\n\nVISUAL MODE:\n[none]';
    const visualErrorText = owner.lastVisualRenderError ? `\n\nVISUAL ERROR:\n${owner.lastVisualRenderError}` : '\n\nVISUAL ERROR:\n[none]';
    const visualCountText = owner.lastVisualBlockCount ? `\n\nVISUAL BLOCKS:\n${owner.lastVisualBlockCount}` : '\n\nVISUAL BLOCKS:\n[none]';
    const visualTopBlockText = owner.lastVisualTopBlockId ? `\n\nVISUAL TOP BLOCK:\n${owner.lastVisualTopBlockId}` : '\n\nVISUAL TOP BLOCK:\n[none]';
    const visualCssText = owner.lastVisualCssStatus ? `\n\nVISUAL CSS:\n${owner.lastVisualCssStatus}` : '\n\nVISUAL CSS:\n[none]';
    return `${errorText}${renderText}${modeText}${visualErrorText}${visualCountText}${visualTopBlockText}${visualCssText}`;
  }

  function getPreferredPreviewIR(owner, fallbackIR = '') {
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
      const roots = parser.parseAll();

      injectVisualStyles();
      const scratchBlocks = typeof globalThis !== 'undefined' ? globalThis.__tb2ScratchBlocks : null;

      if (roots.length === 1) {
        if (!renderProcedureWithScratchBlocks(visual, roots[0], scratchBlocks)) {
          const vr = new VisualRenderer(visual);
          vr.renderProcedure(roots[0]);
        }
      } else if (roots.length > 1) {
        if (!renderMultipleWithScratchBlocks(visual, roots, scratchBlocks)) {
          visual.innerHTML = '';
          for (const ast of roots) {
            const container = document.createElement('div');
            container.style.marginBottom = '12px';
            visual.appendChild(container);
            const vr = new VisualRenderer(container);
            vr.renderProcedure(ast);
          }
        }
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
    } catch (err) {
      const msg = owner.lastError || (err && err.message ? err.message : String(err));
      visual.innerHTML = `<div style="color:#c00;font-family:monospace;font-size:.85rem;padding:1rem;white-space:pre-wrap">ERROR:\n${msg}</div>`;
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
        this.addCategoryClass(header, 'custom');
        this.renderProcedureHeader(header, node.proccode || '', node.argumentnames || []);

        const body = this.el('div', 'bfv-procedure-body');
        body.appendChild(this.renderStack(node.body));

        shell.appendChild(header);
        shell.appendChild(body);
        this.root.appendChild(shell);
    }

    renderProcedureHeader(container, proccode, argumentnames) {
        const parts = proccode.split(/(%[snb])/g);
        let argIndex = 0;
        for (const part of parts) {
          if (part === '%s' || part === '%n') {
            const slot = this.el('div', 'bfv-arg-slot bfv-arg-slot-round');
            slot.appendChild(this.el('span', 'bfv-label', argumentnames[argIndex] || ''));
            container.appendChild(slot);
            argIndex++;
          } else if (part === '%b') {
            const slot = this.el('div', 'bfv-arg-slot bfv-arg-slot-boolean');
            slot.appendChild(this.el('span', 'bfv-label', argumentnames[argIndex] || ''));
            container.appendChild(slot);
            argIndex++;
          } else if (part) {
            container.appendChild(this.el('span', 'bfv-label', part));
          }
        }
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
        if (node.valueType === 'string') {
            const block = this.el('span', 'bfv-round-block');
            this.addCategoryClass(block, 'data');
            block.dataset.nodeKind = 'literal';
            block.dataset.literalType = node.valueType;
            block.textContent = String(node.value);
            return block;
        }
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
    try { owner.validateIR({ IR: irText }); } catch {}
    try { owner.renderIR({ IR: irText }); } catch {};

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

  function showIRPreviewOnly(owner, irText, titleSuffix) {
    injectVisualStyles();
    const title = 'Blockify IR Preview' + (titleSuffix ? ' \u2014 ' + titleSuffix : '');
    const { panel, body } = makeFloatingPanel('blockify-phase1-preview', title);

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

    body.appendChild(visual);
    refreshVisualPreview(owner, visual, irText);

    return panel;
  }

  function showErrorPanel(message) {
    injectVisualStyles();
    const { panel, body } = makeFloatingPanel('blockify-phase1-preview', 'Blockify Error');
    const visual = document.createElement('div');
    visual.style.cssText = [
      'flex:1', 'min-height:0', 'overflow:auto',
      'background:#f3f3f3', 'border:1px solid #666',
      'border-radius:8px', 'padding:0'
    ].join(';');
    visual.innerHTML = `<div style="color:#c00;font-family:monospace;font-size:.85rem;padding:1rem;white-space:pre-wrap">ERROR:\n${message}</div>`;
    body.appendChild(visual);
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
    buffers.append(sourcePane.pane);

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

    const copyBtn = makeBtn('Copy IR', async () => {
      try {
        await navigator.clipboard.writeText(sourcePane.textarea.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy IR';
        }, 1200);
      } catch {
        sourcePane.textarea.focus();
        sourcePane.textarea.select();
        sourcePane.textarea.setSelectionRange(0, sourcePane.textarea.value.length);
        try {
          document.execCommand('copy');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy IR';
          }, 1200);
        } catch {
          copyBtn.textContent = 'Copy Failed';
          setTimeout(() => {
            copyBtn.textContent = 'Copy IR';
          }, 1200);
        }
      }
    });

    const clearBtn = makeBtn('Clear IR', () => {
      sourcePane.textarea.value = '';
      owner.setBufferText('');
      owner.lastError = '';
      owner.lastRender = '';
      owner.lastVisualRenderMode = '';
      owner.lastVisualRenderError = '';
      refreshStatus();
      sourcePane.textarea.focus();
    });

    const closeBtn = makeBtn('Close', () => overlay.remove());

    row.append(applyBtn, copyBtn, clearBtn, closeBtn);

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

    content.append(buffers, status, visual);
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
      this.pendingIR = null;
      this.pendingBridgeProposalId = null;
      this._bridgeClient = null;
      this._bridge = null;
      this.preCommitWorkspaceXml = '';
      this._panel = new TB2Panel();
      this._panel._onSend = (prompt) => this.runTB2AgentLoop(prompt);
      this._panel._onCompact = () => this.compactHistory();
      this._conversationHistory = [];
    }

    setBufferText(text) {
      this.irBuffer = String(text || '');
    }

    getInfo() {
      return {
        id: 'blockify2',
        name: 'Blockify 2',
        color1: '#5b6ee1',
        color2: '#4c5cc5',
        blocks: [
          {
            opcode: 'editIRBuffer',
            blockType: Scratch.BlockType.COMMAND,
            text: 'open Blockify IR editor'
          },
          {
            opcode: 'loadClipboardIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Blockify clipboard contents'
          },
          {
            opcode: 'commitIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'commit IR from clipboard'
          },
          {
            opcode: 'proposeIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'propose IR from clipboard'
          },
          {
            opcode: 'approveIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'approve pending IR'
          },
          {
            opcode: 'rejectIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'reject pending IR'
          },
          {
            opcode: 'undoCommit',
            blockType: Scratch.BlockType.COMMAND,
            text: 'undo last Blockify commit'
          },
          {
            opcode: 'hasPendingIR',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'IR pending?'
          },
          {
            opcode: 'connectBridge',
            blockType: Scratch.BlockType.COMMAND,
            text: 'connect to bridge [URL]',
            arguments: { URL: { type: Scratch.ArgumentType.STRING, defaultValue: 'ws://localhost:7331' } }
          },
          {
            opcode: 'disconnectBridge',
            blockType: Scratch.BlockType.COMMAND,
            text: 'disconnect from bridge'
          },
          {
            opcode: 'bridgeConnected',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'bridge connected?'
          },
          {
            opcode: 'readClipboard',
            blockType: Scratch.BlockType.REPORTER,
            text: 'clipboard contents'
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

    openClipboardPreviewButton() {
      return openClipboardPreviewFromClipboard(this);
    }

    editIRBuffer() {
      showEditor(this);
    }

    blockifyClipboardText() {
      return openClipboardPreviewFromClipboard(this);
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

    async loadClipboardIR() {
      const text = (await readClipboardText()).trim();
      if (!text) {
        this.lastError = 'Clipboard is empty';
        showErrorPanel('Clipboard is empty');
        return;
      }
      showClipboardPreview(this, text);
    }

    async commitIR() {
      const text = (await readClipboardText()).trim();
      if (!text) {
        this.lastError = 'Clipboard is empty';
        return;
      }
      const result = commitIRToWorkspace(text);
      if (!result.success) {
        this.lastError = result.error;
      } else {
        this.lastError = '';
      }
    }

    async proposeIR() {
      const text = (await readClipboardText()).trim();
      if (!text) {
        this.lastError = 'Clipboard is empty';
        return;
      }
      try {
        new Parser(text).parseAll();
      } catch (e) {
        this.lastError = e.message;
        return;
      }
      this.pendingIR = text;
      this.lastError = '';
      const spriteName = (Scratch.vm && Scratch.vm.editingTarget && Scratch.vm.editingTarget.sprite)
        ? Scratch.vm.editingTarget.sprite.name : '';
      this._panel.showProposal(this, text, spriteName);
    }

    proposeIRFromBridge(irText, bridgeProposalId, bridgeClient) {
      try {
        new Parser(irText).parseAll();
      } catch (e) {
        return { ok: false, error: e.message };
      }
      this.pendingIR = irText;
      this.pendingBridgeProposalId = bridgeProposalId;
      this._bridgeClient = bridgeClient || null;
      this.lastError = '';
      const spriteName = (Scratch.vm && Scratch.vm.editingTarget && Scratch.vm.editingTarget.sprite)
        ? Scratch.vm.editingTarget.sprite.name : '';
      this._panel.showProposal(this, irText, spriteName);
      return { ok: true };
    }

    approveIRFromBridge(bridgeProposalId, bridgeClient) {
      if (this.pendingBridgeProposalId !== bridgeProposalId) return;
      this.preCommitWorkspaceXml = captureWorkspaceXml();
      const result = commitIRToWorkspace(this.pendingIR);
      this.pendingIR = null;
      this.pendingBridgeProposalId = null;
      if (!result.success) {
        this.lastError = result.error;
      } else {
        this.lastError = '';
      }
      if (bridgeClient) {
        bridgeClient.send({ type: 'proposalApproved', proposalId: bridgeProposalId });
      }
    }

    approveIR() {
      if (!this.pendingIR) return;
      const proposalId = this.pendingBridgeProposalId;
      const bridgeClient = this._bridgeClient;
      this.preCommitWorkspaceXml = captureWorkspaceXml();
      const result = commitIRToWorkspace(this.pendingIR);
      this.pendingIR = null;
      this.pendingBridgeProposalId = null;
      this._bridgeClient = null;
      if (!result.success) {
        this.lastError = result.error;
      } else {
        this.lastError = '';
      }
      if (bridgeClient && proposalId) {
        bridgeClient.send({ type: 'proposalApproved', proposalId });
      }
    }

    rejectIRFromBridge(bridgeProposalId, bridgeClient) {
      if (this.pendingBridgeProposalId !== bridgeProposalId) return;
      this.pendingIR = null;
      this.pendingBridgeProposalId = null;
      this._bridgeClient = null;
      this.lastError = '';
      if (bridgeClient) {
        bridgeClient.send({ type: 'proposalRejected', proposalId: bridgeProposalId });
      }
    }

    rejectIR() {
      const proposalId = this.pendingBridgeProposalId;
      const bridgeClient = this._bridgeClient;
      this.pendingIR = null;
      this.pendingBridgeProposalId = null;
      this._bridgeClient = null;
      this.lastError = '';
      if (bridgeClient && proposalId) {
        bridgeClient.send({ type: 'proposalRejected', proposalId });
      }
    }

    undoCommit() {
      if (!this.preCommitWorkspaceXml) return;
      restoreWorkspaceXml(this.preCommitWorkspaceXml);
      this.preCommitWorkspaceXml = '';
    }

    hasPendingIR() {
      return this.pendingIR !== null;
    }

    connectBridge(args) {
      const url = String(args && args.URL ? args.URL : 'ws://localhost:7331');
      if (this._bridge) this._bridge.disconnect();
      this._bridge = createBridgeClient({ owner: this });
      this._bridge.connect(url);
    }

    disconnectBridge() {
      if (this._bridge) {
        this._bridge.disconnect();
        this._bridge = null;
      }
    }

    bridgeConnected() {
      return !!(this._bridge && this._bridge.isConnected);
    }

    async readClipboard() {
      return readClipboardText();
    }

    getLastError() {
      return this.lastError || '';
    }

    async runTB2AgentLoop(userPrompt) {
      if (!userPrompt || !userPrompt.trim()) return;

      this._panel.log(`User: "${userPrompt}"`);
      this._panel.appendChat('user', userPrompt);

      const apiKey = typeof localStorage !== 'undefined' ? localStorage.getItem('tb2_api_key') : null;
      const provider = typeof localStorage !== 'undefined' ? (localStorage.getItem('tb2_provider') || 'claude') : 'claude';
      if (!apiKey) { this._panel.showSettings(); return; }

      const textifyHooks = globalThis.__tb2TextifyHooks;
      const editingTarget = Scratch.vm && Scratch.vm.editingTarget;
      const spriteName = editingTarget && editingTarget.sprite ? editingTarget.sprite.name : 'Sprite1';
      const targetIR = (textifyHooks && editingTarget) ? (textifyHooks.exportAllStacksText(editingTarget) || '') : '';
      this._panel.log(`Sprite: ${spriteName} | Provider: ${provider}`);

      let fullStateIR = targetIR;
      if (textifyHooks && Scratch.vm) {
        const parts = [];
        for (const t of Scratch.vm.runtime.targets) {
          const ir = textifyHooks.exportAllStacksText(t);
          if (ir) parts.push(ir);
        }
        if (parts.length) fullStateIR = parts.join('\n\n');
      }

      const proxyUrl = (typeof TB2_CLAUDE_PROXY_URL !== 'undefined') ? TB2_CLAUDE_PROXY_URL : 'http://localhost:7331/proxy/claude'; // eslint-disable-line no-undef
      const label = provider === 'openai' ? 'OpenAI (gpt-4o)' : 'Claude (claude-opus-4-6)';
      const systemPrompt = buildTB2Prompt({ fullStateIR, spriteName, targetIR });

      const callProvider = async (msgs) => {
        if (provider === 'openai') return callOpenAI(systemPrompt, msgs, apiKey);
        return callClaudeViaProxy(systemPrompt, msgs, apiKey, proxyUrl);
      };

      // Add user message to conversation history and build messages snapshot
      this._pushHistory('user', userPrompt);
      const messages = this._conversationHistory.slice();

      this._panel.log(`Calling ${label}…`);
      this._panel.showThinking('Working…');

      try {
        const raw = await callProvider(messages);
        this._panel.log(`Response received (${raw.length} chars)`);
        const result = parseTB2AgentResponse(raw);
        this._panel.log(`Parsed: ${result.type}${result.reason ? ` — ${result.reason}` : ''}`);

        // Record agent response in conversation history
        this._pushHistory('assistant', raw);

        if (result.type === 'DISCUSS') {
          this._panel.log(`Agent: "${result.text.slice(0, 80)}${result.text.length > 80 ? '…' : ''}"`);
          this._panel.appendChat('assistant', result.text, { type: 'discuss' });
          this._panel.showIdle();
          return;
        }

        if (result.type === 'NO_CHANGE') {
          this._panel.appendChat('assistant', 'No changes needed — the requested behaviour is already present.', { type: 'discuss' });
          this._panel.showIdle();
          return;
        }

        if (result.type === 'ERROR') {
          this._panel.showError(result.reason);
          return;
        }

        if (result.type === 'PARSE_FAILURE') {
          this._panel.showError(`Unexpected response:\n${result.raw}`);
          return;
        }

        if (result.type === 'PROPOSE_READY') {
          this._panel.log(`Propose ready: "${result.summary.slice(0, 80)}${result.summary.length > 80 ? '…' : ''}"`);
          const ir = result.ir;
          const owner = this;
          this._panel.appendChat('assistant', result.summary, {
            type: 'propose_ready',
            ir,
            spriteName,
            onBuild: () => {
              this._panel.log('User clicked Build it — validating…');
              const proposeResult = owner.proposeIRDirect(ir);
              if (proposeResult.ok) {
                this._panel.log(`Validation passed — proposing to ${spriteName}`);
              } else {
                this._panel.log(`Validation failed: ${proposeResult.error}`);
                this._panel.showError(`Validation failed:\n${proposeResult.error}`);
              }
            },
            onDiscard: () => {
              this._panel.log('User chose to keep discussing');
              this._panel.discardProposeReady();
            }
          });
          this._panel.showIdle();
          return;
        }

        // IR_ONLY — validate and propose, retry once on failure
        const proposeResult = this.proposeIRDirect(result.ir);
        if (proposeResult.ok) {
          this._panel.log(`Validation passed — proposing to ${spriteName}`);
          return;
        }

        this._panel.log(`Validation failed: ${proposeResult.error}`);
        const retryMessages = [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: `Previous attempt failed validation: ${proposeResult.error}\nPlease fix and try again.` }
        ];
        this._panel.log(`Retry — calling ${label}…`);
        this._panel.showThinking('Retrying…');
        const retryRaw = await callProvider(retryMessages);
        this._panel.log(`Retry response (${retryRaw.length} chars)`);
        const retryResult = parseTB2AgentResponse(retryRaw);
        this._panel.log(`Retry parsed: ${retryResult.type}`);

        if (retryResult.type !== 'IR_ONLY') {
          this._panel.showError(`Retry failed:\n${retryRaw.slice(0, 300)}`);
          return;
        }
        const retryProposeResult = this.proposeIRDirect(retryResult.ir);
        if (retryProposeResult.ok) {
          this._panel.log(`Retry validation passed — proposing to ${spriteName}`);
          this._pushHistory('user', `Previous attempt failed validation: ${proposeResult.error}\nPlease fix and try again.`);
          this._pushHistory('assistant', retryRaw);
        } else {
          this._panel.log(`Retry validation failed: ${retryProposeResult.error}`);
          this._panel.showError(`Validation failed after retry:\n${retryProposeResult.error}`);
        }
      } catch (e) {
        this._panel.log(`Error: ${e.message}`);
        this._panel.showError(e.message);
        // Roll back the user message since the call failed
        this._popHistory();
      }
    }

    _pushHistory(role, content) {
      this._conversationHistory.push({ role, content });
      this._panel._contextCharCount = this._conversationHistory.reduce((s, m) => s + m.content.length, 0);
    }

    _popHistory() {
      this._conversationHistory.pop();
      this._panel._contextCharCount = this._conversationHistory.reduce((s, m) => s + m.content.length, 0);
    }

    async compactHistory() {
      const apiKey = typeof localStorage !== 'undefined' ? localStorage.getItem('tb2_api_key') : null;
      const provider = typeof localStorage !== 'undefined' ? (localStorage.getItem('tb2_provider') || 'claude') : 'claude';
      if (!apiKey || !this._conversationHistory.length) return;

      this._panel.showThinking('Summarizing session…');
      this._panel.log('Compacting context window…');

      const proxyUrl = (typeof TB2_CLAUDE_PROXY_URL !== 'undefined') ? TB2_CLAUDE_PROXY_URL : 'http://localhost:7331/proxy/claude'; // eslint-disable-line no-undef
      const compactMessages = [
        ...this._conversationHistory,
        { role: 'user', content: 'Please write a 2-3 sentence summary of what has been built and what key decisions were made in this conversation. Be specific about scripts, variables, and behaviours that now exist.' }
      ];

      try {
        let summary;
        if (provider === 'openai') {
          summary = await callOpenAI('You are summarizing a Scratch game development session.', compactMessages, apiKey);
        } else {
          summary = await callClaudeViaProxy('You are summarizing a Scratch game development session.', compactMessages, apiKey, proxyUrl);
        }

        this._panel.log(`Compacted. Summary: "${summary.slice(0, 80)}${summary.length > 80 ? '…' : ''}"`);

        // Clear history and chat display
        this._conversationHistory = [];
        this._panel._chatMessages = [];
        this._panel._contextCharCount = 0;

        // Pin summary note in chat
        this._panel.appendChat('assistant', `Session compacted.\n\n${summary}`, { type: 'discuss' });

        // Inject summary as seed context for future calls
        this._pushHistory('user', `Session context (prior history compacted): ${summary}`);
        this._pushHistory('assistant', 'Understood. Ready to continue.');

        this._panel.showIdle('Session compacted ✓');
      } catch (e) {
        this._panel.log(`Compact failed: ${e.message}`);
        this._panel.showError(`Could not compact: ${e.message}`);
      }
    }

    proposeIRDirect(irText) {
      try {
        new Parser(irText).parseAll();
      } catch (e) {
        return { ok: false, error: e.message };
      }
      this.pendingIR = irText;
      this.lastError = '';
      const spriteName = (Scratch.vm && Scratch.vm.editingTarget && Scratch.vm.editingTarget.sprite)
        ? Scratch.vm.editingTarget.sprite.name : '';
      this._panel.showProposal(this, irText, spriteName);
      return { ok: true };
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 1 — VM Writer
  // ---------------------------------------------------------------------------

  function generateUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function remintBlockIds(roots) {
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'opcode') {
        node.id = generateUID();
      }
      if (node.body) walk(node.body);
      if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child);
      }
      const inputs = node.inputs || {};
      for (const key of Object.keys(inputs)) walk(inputs[key]);
      const stacks = node.stacks || {};
      for (const key of Object.keys(stacks)) walk(stacks[key]);
    }
    for (const root of roots) walk(root);
  }

  function declareVariablesInVM(roots, vm) {
    const vars = new Map();
    for (const root of roots) collectDeclaredVariables(root, vars);
    const stage = vm.runtime.targets.find(t => t.isStage);
    for (const [, { name, type }] of vars) {
      const id = variableIdFor(name, type);
      if (type === 'broadcast_msg') {
        if (stage && !Object.prototype.hasOwnProperty.call(stage.variables, id)) {
          stage.variables[id] = { id, name, type: 'broadcast_msg', value: name };
        }
      } else {
        if (!Object.prototype.hasOwnProperty.call(vm.editingTarget.variables, id)) {
          vm.editingTarget.variables[id] = {
            id,
            name,
            type: type === 'list' ? 'list' : '',
            value: type === 'list' ? [] : 0
          };
        }
      }
    }
  }

  function injectRootsIntoWorkspace(roots) {
    const xmlText = astToScratchBlocksXmlMulti(roots);
    // Use bracket notation so esbuild does not substitute the bundled ScratchBlocks module.
    const twScratchBlocks = globalThis['ScratchBlocks'];
    const dom = twScratchBlocks.Xml.textToDom(xmlText);
    const workspace = twScratchBlocks.getMainWorkspace();
    twScratchBlocks.Xml.domToWorkspace(dom, workspace);
  }

  function commitIRToWorkspace(irText) {
    try {
      const roots = new Parser(irText).parseAll();
      remintBlockIds(roots);
      declareVariablesInVM(roots, Scratch.vm);
      injectRootsIntoWorkspace(roots);
      return { success: true, blockCount: roots.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — Proposal panel UI
  // ---------------------------------------------------------------------------

  function showProposalPanel(owner, irText) {
    injectVisualStyles();
    const { panel, body } = makeFloatingPanel('blockify2-proposal-panel', 'Blockify 2 — Proposed Changes');

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
    body.appendChild(visual);
    refreshVisualPreview(owner, visual, irText);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:10px;padding:10px 12px;background:#222;border-top:1px solid #444;justify-content:flex-end';

    const rejectBtn = document.createElement('button');
    rejectBtn.textContent = 'Reject';
    rejectBtn.style.cssText = 'padding:8px 20px;border-radius:8px;border:none;background:#c0392b;color:#fff;font:bold 13px sans-serif;cursor:pointer';
    rejectBtn.onclick = () => { owner.rejectIR(); panel.remove(); };

    const approveBtn = document.createElement('button');
    approveBtn.textContent = 'Approve';
    approveBtn.style.cssText = 'padding:8px 20px;border-radius:8px;border:none;background:#27ae60;color:#fff;font:bold 13px sans-serif;cursor:pointer';
    approveBtn.onclick = () => { owner.approveIR(); panel.remove(); };

    footer.appendChild(rejectBtn);
    footer.appendChild(approveBtn);
    panel.appendChild(footer);
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — Workspace snapshot (undo support)
  // ---------------------------------------------------------------------------

  function captureWorkspaceXml() {
    try {
      const twScratchBlocks = globalThis['ScratchBlocks'];
      const workspace = twScratchBlocks.getMainWorkspace();
      const dom = twScratchBlocks.Xml.workspaceToDom(workspace);
      return twScratchBlocks.Xml.domToText(dom);
    } catch {
      return '';
    }
  }

  function restoreWorkspaceXml(xmlText) {
    if (!xmlText) return;
    const twScratchBlocks = globalThis['ScratchBlocks'];
    const workspace = twScratchBlocks.getMainWorkspace();
    workspace.clear();
    const dom = twScratchBlocks.Xml.textToDom(xmlText);
    twScratchBlocks.Xml.domToWorkspace(dom, workspace);
  }

  // ---------------------------------------------------------------------------
  // Phase 4 — BridgeClient
  // ---------------------------------------------------------------------------

  class BridgeClient {
    constructor({ reconnectDelay = 3000, owner = null } = {}) {
      this._ws = null;
      this._url = null;
      this._reconnectTimer = null;
      this._reconnectDelay = reconnectDelay;
      this._owner = owner;
    }

    connect(url) {
      this._url = url;
      this._open();
    }

    disconnect() {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
      this._url = null;
      if (this._ws) {
        this._ws.close();
        this._ws = null;
      }
    }

    _open() {
      if (!this._url) return;
      const ws = new globalThis.WebSocket(this._url);
      this._ws = ws;
      ws.onopen = () => { /* connected */ };
      ws.onmessage = (event) => this._onMessage(event.data);
      ws.onclose = () => {
        if (this._ws === ws) this._ws = null;
        this._scheduleReconnect();
      };
      ws.onerror = () => { /* errors are handled via onclose */ };
    }

    _scheduleReconnect() {
      if (!this._url || this._reconnectTimer !== null) return;
      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this._open();
      }, this._reconnectDelay);
    }

    send(message) {
      if (this._ws && this._ws.readyState === 1 /* OPEN */) {
        this._ws.send(JSON.stringify(message));
      }
    }

    _onMessage(data) {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === 'getState') { this._handleGetState(msg); return; }
      if (msg.type === 'getSprite') { this._handleGetSprite(msg); return; }
      if (msg.type === 'propose') { this._handlePropose(msg); return; }
      if (msg.type === 'commit') { this._handleCommit(msg); return; }
      if (msg.type === 'reject') { this._handleReject(msg); return; }
    }

    _handleReject(msg) {
      if (!this._owner) {
        this.send({ id: msg.id, ok: false, error: 'No extension owner' });
        return;
      }
      this._owner.rejectIRFromBridge(msg.proposalId, this);
      this.send({ id: msg.id, ok: true });
    }

    _handleCommit(msg) {
      if (!this._owner) {
        this.send({ id: msg.id, ok: false, error: 'No extension owner' });
        return;
      }
      this._owner.approveIRFromBridge(msg.proposalId, this);
      this.send({ id: msg.id, ok: true });
    }

    _handlePropose(msg) {
      if (!this._owner) {
        this.send({ id: msg.id, ok: false, error: 'No extension owner' });
        return;
      }
      const result = this._owner.proposeIRFromBridge(msg.ir, msg.proposalId, this);
      this.send({ id: msg.id, ...result });
    }

    _handleGetSprite(msg) {
      try {
        const textifyHooks = globalThis.__tb2TextifyHooks;
        if (!textifyHooks) {
          this.send({ id: msg.id, ok: false, error: 'Textify 2 not loaded' });
          return;
        }
        const target = Scratch.vm.runtime.targets.find(
          t => t.sprite && t.sprite.name === msg.name
        );
        if (!target) {
          this.send({ id: msg.id, ok: false, error: `Sprite not found: ${msg.name}` });
          return;
        }
        const ir = textifyHooks.exportAllStacksText(target);
        this.send({ id: msg.id, ok: true, ir: ir || '' });
      } catch (e) {
        this.send({ id: msg.id, ok: false, error: e.message });
      }
    }

    _handleGetState(msg) {
      try {
        const textifyHooks = globalThis.__tb2TextifyHooks;
        if (!textifyHooks) {
          this.send({ id: msg.id, ok: false, error: 'Textify 2 not loaded' });
          return;
        }
        const targets = Scratch.vm.runtime.targets;
        const parts = [];
        for (const target of targets) {
          const ir = textifyHooks.exportAllStacksText(target);
          if (ir) parts.push(ir);
        }
        const editingTarget = Scratch.vm.editingTarget && Scratch.vm.editingTarget.sprite
          ? Scratch.vm.editingTarget.sprite.name
          : undefined;
        this.send({ id: msg.id, ok: true, ir: parts.join('\n\n'), editingTarget });
      } catch (e) {
        this.send({ id: msg.id, ok: false, error: e.message });
      }
    }

    get isConnected() {
      return this._ws !== null && this._ws.readyState === 1 /* OPEN */;
    }
  }

  function createBridgeClient(options) {
    return new BridgeClient(options);
  }

  // ---------------------------------------------------------------------------
  // TB2Panel — unified persistent floating panel
  // ---------------------------------------------------------------------------

  class TB2Panel {
    constructor() {
      this.state = 'idle';
      this.collapsed = false;
      this.statusMessage = '';
      this.errorMessage = '';
      this._owner = null;
      this._el = null;
      this._bodyEl = null;
      this._log = [];
      this._logExpanded = true;
      this._logBodyEl = null;
      this._logToggleEl = null;
      this._chatMessages = [];
      this._contextCharCount = 0;
      this._onCompact = null;
      this._init();
    }

    _init() {
      if (typeof document === 'undefined') return;
      const hasKey = !!(
        typeof localStorage !== 'undefined' && localStorage.getItem('tb2_api_key')
      );
      injectVisualStyles();
      const old = document.getElementById('tb2-prompt-panel');
      if (old) old.remove();

      const MIN_W = 360;
      const MIN_H = 280;

      const panel = document.createElement('div');
      panel.id = 'tb2-prompt-panel';
      panel.style.cssText = [
        'position:fixed', 'top:24px', 'right:24px',
        'width:360px', 'background:#181818',
        'border:1px solid #555', 'border-radius:12px',
        'box-shadow:0 8px 24px rgba(0,0,0,.5)',
        'z-index:999998', 'display:flex', 'flex-direction:column',
        'overflow:hidden', 'font-family:sans-serif',
        `min-width:${MIN_W}px`, `min-height:${MIN_H}px`
      ].join(';');

      const header = document.createElement('div');
      header.style.cssText = [
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'padding:8px 12px', 'background:#222', 'border-bottom:1px solid #444',
        'cursor:grab', 'user-select:none', 'flex-shrink:0'
      ].join(';');
      const headerTitle = document.createElement('span');
      headerTitle.textContent = 'TB2 AI';
      headerTitle.style.cssText = 'color:#fff;font:bold 13px sans-serif';
      const minimizeBtn = document.createElement('button');
      minimizeBtn.textContent = '–';
      minimizeBtn.style.cssText = 'background:none;border:none;color:#aaa;cursor:pointer;font-size:16px;padding:0 4px';
      minimizeBtn.onclick = (e) => { e.stopPropagation(); this.collapsed ? this.expand() : this.collapse(); };
      header.append(headerTitle, minimizeBtn);

      const body = document.createElement('div');
      body.id = 'tb2-prompt-panel-body';
      body.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto';

      const logSection = document.createElement('div');
      logSection.style.cssText = 'border-top:1px solid #333;display:flex;flex-direction:column;flex-shrink:0';

      const logHeader = document.createElement('div');
      logHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 12px;cursor:pointer;user-select:none';

      const logToggle = document.createElement('span');
      logToggle.textContent = '▼ Session Log';
      logToggle.style.cssText = 'color:#777;font-size:11px';

      const copyAllBtn = document.createElement('button');
      copyAllBtn.textContent = 'Copy All';
      copyAllBtn.style.cssText = 'padding:2px 8px;border-radius:4px;border:1px solid #444;background:#2d2d2d;color:#999;font-size:10px;cursor:pointer';
      copyAllBtn.onclick = (e) => { e.stopPropagation(); this._copyLog(); };

      logHeader.append(logToggle, copyAllBtn);
      logHeader.onclick = () => {
        this._logExpanded = !this._logExpanded;
        logBody.style.display = this._logExpanded ? 'block' : 'none';
        logToggle.textContent = (this._logExpanded ? '▼' : '▶') + ' Session Log';
      };

      const logBody = document.createElement('div');
      logBody.style.cssText = [
        'padding:4px 12px 10px', 'max-height:160px', 'overflow-y:auto',
        'font-family:monospace', 'font-size:10px', 'line-height:1.6',
        'color:#888', 'user-select:text', 'white-space:pre-wrap', 'word-break:break-all'
      ].join(';');

      // Resize handle — triangle in bottom-right corner
      const resizeHandle = document.createElement('div');
      resizeHandle.style.cssText = 'position:absolute;bottom:0;right:0;width:16px;height:16px;cursor:se-resize;z-index:1;line-height:0';
      resizeHandle.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M16 0 L16 16 L0 16 Z" fill="#444"/></svg>';

      logSection.append(logHeader, logBody);
      panel.append(header, body, logSection, resizeHandle);
      document.body.appendChild(panel);

      this._el = panel;
      this._bodyEl = body;
      this._logBodyEl = logBody;
      this._logToggleEl = logToggle;

      // Restore saved position and size
      if (typeof localStorage !== 'undefined') {
        const sx = localStorage.getItem('tb2_panel_x');
        const sy = localStorage.getItem('tb2_panel_y');
        const sw = localStorage.getItem('tb2_panel_w');
        const sh = localStorage.getItem('tb2_panel_h');
        if (sx !== null && sy !== null) {
          panel.style.right = '';
          panel.style.left = sx + 'px';
          panel.style.top = sy + 'px';
        }
        if (sw !== null) panel.style.width = sw + 'px';
        if (sh !== null) panel.style.height = sh + 'px';
      }

      // Drag logic
      let dragState = null;

      header.addEventListener('mousedown', (e) => {
        if (e.target === minimizeBtn) return;
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        panel.style.right = '';
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        dragState = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top, moved: false };
        header.style.cursor = 'grabbing';
      });

      // Resize logic
      let resizeState = null;

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = panel.getBoundingClientRect();
        resizeState = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height };
      });

      document.addEventListener('mousemove', (e) => {
        if (dragState) {
          const dx = e.clientX - dragState.startX;
          const dy = e.clientY - dragState.startY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
          panel.style.left = (dragState.startLeft + dx) + 'px';
          panel.style.top = (dragState.startTop + dy) + 'px';
        }
        if (resizeState) {
          const dw = e.clientX - resizeState.startX;
          const dh = e.clientY - resizeState.startY;
          panel.style.width = Math.max(MIN_W, resizeState.startW + dw) + 'px';
          panel.style.height = Math.max(MIN_H, resizeState.startH + dh) + 'px';
        }
      });

      document.addEventListener('mouseup', () => {
        if (dragState) {
          header.style.cursor = 'grab';
          if (dragState.moved && typeof localStorage !== 'undefined') {
            const rect = panel.getBoundingClientRect();
            localStorage.setItem('tb2_panel_x', Math.round(rect.left));
            localStorage.setItem('tb2_panel_y', Math.round(rect.top));
          }
          dragState = null;
        }
        if (resizeState) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('tb2_panel_w', Math.round(parseFloat(panel.style.width)));
            localStorage.setItem('tb2_panel_h', Math.round(parseFloat(panel.style.height)));
          }
          resizeState = null;
        }
      });

      // Only expand on click if not a drag
      header.onclick = () => {
        if (dragState && dragState.moved) return;
        if (this.collapsed) this.expand();
      };

      if (hasKey) {
        this.showIdle();
      } else {
        this.showSettings();
      }
    }

    _clearBody() {
      if (!this._bodyEl) return;
      this._bodyEl.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow-y:auto';
      while (this._bodyEl.children.length) this._bodyEl.children[0].remove();
    }

    collapse() {
      this.collapsed = true;
      if (this._bodyEl) this._bodyEl.style.display = 'none';
    }

    expand() {
      this.collapsed = false;
      if (this._bodyEl) this._bodyEl.style.display = 'flex';
    }

    log(text) {
      const now = new Date();
      const ts = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
      ].join(':');
      const entry = `[${ts}] ${text}`;
      this._log.push(entry);
      if (this._logBodyEl) {
        const line = document.createElement('div');
        line.textContent = entry;
        this._logBodyEl.appendChild(line);
        this._logBodyEl.scrollTop = this._logBodyEl.scrollHeight;
      }
    }

    _copyLog() {
      const text = this._log.join('\n');
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => this._copyLogFallback(text));
      } else {
        this._copyLogFallback(text);
      }
    }

    _copyLogFallback(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }

    showIdle(message) {
      this.state = 'idle';
      this.statusMessage = message || '';
      this._clearBody();
      if (!this._bodyEl) return;

      // Chat history
      if (this._chatMessages.length > 0) {
        const chatDiv = document.createElement('div');
        chatDiv.style.cssText = 'flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-bottom:4px';

        for (const msg of this._chatMessages) {
          if (msg.type === 'propose_ready') {
            const card = document.createElement('div');
            card.style.cssText = 'background:#1a2a1a;border:1px solid #3a5a3a;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex-shrink:0';
            const label = document.createElement('div');
            label.textContent = 'Ready to build:';
            label.style.cssText = 'color:#7cb87c;font-size:11px;font-weight:bold';
            const summary = document.createElement('div');
            summary.textContent = msg.text;
            summary.style.cssText = 'color:#ccc;font-size:12px;line-height:1.5';
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
            const discardBtn = document.createElement('button');
            discardBtn.textContent = 'Keep discussing';
            discardBtn.style.cssText = 'padding:4px 10px;border-radius:6px;border:1px solid #555;background:#2d2d2d;color:#aaa;font-size:11px;cursor:pointer';
            discardBtn.onclick = () => { if (msg.onDiscard) msg.onDiscard(); };
            const buildBtn = document.createElement('button');
            buildBtn.textContent = 'Build it ▶';
            buildBtn.style.cssText = 'padding:4px 12px;border-radius:6px;border:none;background:#27ae60;color:#fff;font:bold 11px sans-serif;cursor:pointer';
            buildBtn.onclick = () => { if (msg.onBuild) msg.onBuild(); };
            btnRow.append(discardBtn, buildBtn);
            card.append(label, summary, btnRow);
            chatDiv.appendChild(card);
          } else {
            const isUser = msg.role === 'user';
            const bubble = document.createElement('div');
            bubble.style.cssText = [
              'max-width:85%', 'padding:7px 10px', 'border-radius:10px',
              'font-size:12px', 'line-height:1.5', 'word-break:break-word', 'flex-shrink:0',
              isUser
                ? 'align-self:flex-end;background:#3b3270;color:#e0d9ff'
                : 'align-self:flex-start;background:#2a2a2a;color:#ccc'
            ].join(';');
            bubble.textContent = msg.text;
            chatDiv.appendChild(bubble);
          }
        }

        this._bodyEl.appendChild(chatDiv);
        requestAnimationFrame(() => { chatDiv.scrollTop = chatDiv.scrollHeight; });
      }

      // Status message
      if (this.statusMessage) {
        const status = document.createElement('div');
        status.textContent = this.statusMessage;
        status.style.cssText = 'color:#aaa;font-size:12px;text-align:center;flex-shrink:0';
        this._bodyEl.appendChild(status);
      }

      // Context warning
      const WARN_AT = 40000;
      const CRITICAL_AT = 80000;
      if (this._contextCharCount > WARN_AT) {
        const isCritical = this._contextCharCount > CRITICAL_AT;
        const warning = document.createElement('div');
        warning.style.cssText = [
          'display:flex', 'align-items:center', 'justify-content:space-between',
          'padding:6px 10px', 'border-radius:6px', 'flex-shrink:0',
          'font-size:11px',
          isCritical
            ? 'background:#3a1a1a;border:1px solid #7a3a3a;color:#e07070'
            : 'background:#2a2a1a;border:1px solid #5a5a2a;color:#c8c870'
        ].join(';');
        const warningText = document.createElement('span');
        warningText.textContent = isCritical
          ? '⚠ Context window nearly full'
          : '⚠ Context getting long';
        const compactBtn = document.createElement('button');
        compactBtn.textContent = 'Compact';
        compactBtn.style.cssText = 'padding:2px 8px;border-radius:4px;border:1px solid currentColor;background:transparent;color:inherit;font-size:10px;cursor:pointer';
        compactBtn.onclick = () => { if (this._onCompact) this._onCompact(); };
        warning.append(warningText, compactBtn);
        this._bodyEl.appendChild(warning);
      }

      // Input area — always at bottom
      const inputArea = document.createElement('div');
      inputArea.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex-shrink:0';

      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Describe what you want to build…';
      textarea.style.cssText = [
        'width:100%', 'min-height:60px', 'background:#111',
        'color:#fff', 'border:1px solid #555', 'border-radius:6px',
        'padding:8px', 'font-size:13px', 'resize:vertical', 'box-sizing:border-box'
      ].join(';');

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';

      const gearBtn = document.createElement('button');
      gearBtn.textContent = '⚙';
      gearBtn.title = 'Settings';
      gearBtn.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #555;background:#2d2d2d;color:#fff;cursor:pointer';
      gearBtn.onclick = () => this.showSettings();

      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#5b6ee1;color:#fff;font:bold 13px sans-serif;cursor:pointer';
      sendBtn.onclick = () => {
        const prompt = textarea.value && textarea.value.trim();
        if (prompt && this._onSend) this._onSend(prompt);
      };

      row.append(gearBtn, sendBtn);
      inputArea.append(textarea, row);
      this._bodyEl.appendChild(inputArea);
    }

    appendChat(role, text, opts = {}) {
      this._chatMessages.push({ role, text, ...opts });
      if (this.state === 'idle') this.showIdle();
    }

    discardProposeReady() {
      for (let i = this._chatMessages.length - 1; i >= 0; i--) {
        if (this._chatMessages[i].type === 'propose_ready') {
          this._chatMessages.splice(i, 1);
          break;
        }
      }
      if (this.state === 'idle') this.showIdle();
    }

    showSettings() {
      this.state = 'settings';
      this._clearBody();
      if (!this._bodyEl) return;

      const providerLabel = document.createElement('label');
      providerLabel.textContent = 'Provider';
      providerLabel.style.cssText = 'color:#ccc;font-size:12px';

      const providerSelect = document.createElement('select');
      providerSelect.style.cssText = 'width:100%;padding:6px;background:#111;color:#fff;border:1px solid #555;border-radius:6px';
      ['claude', 'openai'].forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p === 'claude' ? 'Claude (Anthropic)' : 'OpenAI';
        providerSelect.appendChild(opt);
      });
      const storedProvider = typeof localStorage !== 'undefined' ? (localStorage.getItem('tb2_provider') || 'claude') : 'claude';
      providerSelect.value = storedProvider;

      const keyLabel = document.createElement('label');
      keyLabel.textContent = 'API Key';
      keyLabel.style.cssText = 'color:#ccc;font-size:12px';

      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.placeholder = 'Paste your API key…';
      keyInput.style.cssText = 'width:100%;padding:6px;background:#111;color:#fff;border:1px solid #555;border-radius:6px;box-sizing:border-box';
      const storedKey = typeof localStorage !== 'undefined' ? (localStorage.getItem('tb2_api_key') || '') : '';
      keyInput.value = storedKey;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';

      if (typeof localStorage !== 'undefined' && localStorage.getItem('tb2_api_key')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid #555;background:#2d2d2d;color:#fff;cursor:pointer';
        cancelBtn.onclick = () => this.showIdle();
        row.appendChild(cancelBtn);
      }

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#27ae60;color:#fff;font:bold 13px sans-serif;cursor:pointer';
      saveBtn.onclick = () => this.saveSettings(keyInput.value.trim(), providerSelect.value);
      row.appendChild(saveBtn);

      this._bodyEl.append(providerLabel, providerSelect, keyLabel, keyInput, row);
    }

    saveSettings(apiKey, provider) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tb2_api_key', apiKey);
        localStorage.setItem('tb2_provider', provider || 'claude');
      }
      this.showIdle();
    }

    showThinking(message) {
      this.state = 'thinking';
      this._clearBody();
      if (!this._bodyEl) return;
      const msg = document.createElement('div');
      msg.textContent = message || 'Working…';
      msg.style.cssText = 'color:#aaa;font-size:13px;text-align:center;padding:8px 0';
      this._bodyEl.appendChild(msg);
    }

    showProposal(owner, irText, spriteName) {
      this.state = 'proposal';
      this._owner = owner;
      this._clearBody();
      if (!this._bodyEl) return;

      if (spriteName) {
        const target = document.createElement('div');
        target.textContent = `Target: ${spriteName}`;
        target.style.cssText = 'color:#aaa;font-size:11px';
        this._bodyEl.appendChild(target);
      }

      const visual = document.createElement('div');
      visual.style.cssText = 'flex:1;min-height:120px;overflow:auto;background:#f3f3f3;border:1px solid #666;border-radius:6px';
      this._bodyEl.appendChild(visual);
      refreshVisualPreview(owner, visual, irText);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

      const rejectBtn = document.createElement('button');
      rejectBtn.textContent = 'Reject';
      rejectBtn.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#c0392b;color:#fff;font:bold 13px sans-serif;cursor:pointer';
      rejectBtn.onclick = () => this.reject();

      const approveBtn = document.createElement('button');
      approveBtn.textContent = 'Approve';
      approveBtn.style.cssText = 'padding:6px 16px;border-radius:6px;border:none;background:#27ae60;color:#fff;font:bold 13px sans-serif;cursor:pointer';
      approveBtn.onclick = () => this.approve();

      row.append(rejectBtn, approveBtn);
      this._bodyEl.appendChild(row);
    }

    approve() {
      this.log('User approved — committing');
      if (this._owner) this._owner.approveIR();
      this.showIdle('Done ✓');
    }

    reject() {
      this.log('User rejected');
      if (this._owner) this._owner.rejectIR();
      this.showIdle();
    }

    showError(message) {
      this.state = 'error';
      this.errorMessage = message;
      this._clearBody();
      if (!this._bodyEl) return;

      const msg = document.createElement('div');
      msg.textContent = 'Something went wrong:';
      msg.style.cssText = 'color:#e74c3c;font-size:12px;font-weight:bold';

      const errorBox = document.createElement('textarea');
      errorBox.value = message;
      errorBox.style.cssText = [
        'width:100%', 'min-height:60px', 'background:#111', 'color:#e74c3c',
        'border:1px solid #c0392b', 'border-radius:6px', 'padding:6px',
        'font-size:11px', 'resize:vertical', 'box-sizing:border-box'
      ].join(';');

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end';
      const backBtn = document.createElement('button');
      backBtn.textContent = 'Back';
      backBtn.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid #555;background:#2d2d2d;color:#fff;cursor:pointer';
      backBtn.onclick = () => this.showIdle();
      row.appendChild(backBtn);

      this._bodyEl.append(msg, errorBox, row);
    }
  }

  // ---------------------------------------------------------------------------
  // Agent logic — prompt builder + response parser
  // ---------------------------------------------------------------------------

  const TB2_GRAMMAR = (typeof __IR_GRAMMAR_TEXT__ !== 'undefined') ? __IR_GRAMMAR_TEXT__ : ''; // eslint-disable-line no-undef

  function buildTB2Prompt({ fullStateIR, spriteName, targetIR }) {
    return `${TB2_GRAMMAR}

## Current Project State

The full project IR is:

<project_ir>
${fullStateIR}
</project_ir>

The sprite you are modifying is: ${spriteName}
Its current IR is:

<target_ir>
${targetIR}
</target_ir>

## Response Format

You are a Scratch/TurboWarp block coding assistant. You can discuss ideas with the user and propose block changes when ready.

You must respond with exactly one of these formats:

**DISCUSS** — for questions, clarifications, or conversation before building
First line: "DISCUSS"
Remaining lines: your message to the user

**PROPOSE_READY** — when you have a clear plan and are ready to generate blocks
First line: "PROPOSE_READY"
Next lines: plain-English summary of exactly what you will build
Then the literal text "IR_ONLY" on its own line
Then: the complete IR for the target sprite

**IR_ONLY** — for short, unambiguous requests needing no discussion
First line: "IR_ONLY"
Remaining lines: the complete IR for the target sprite

**NO_CHANGE** — if the requested change is already present
Exactly: "NO_CHANGE"

**ERROR:** — if the request is impossible or contradictory
Exactly: "ERROR: <one-line reason>"

When to use each:
- Use DISCUSS when the request needs clarification, involves design decisions, or you want to explore options before building
- Use PROPOSE_READY when you have discussed enough and are confident in a plan — always summarise what you will build before generating IR so the user can confirm
- Use IR_ONLY only for clear, direct, unambiguous requests (e.g. "add a move right block")
- Never generate IR without either the IR_ONLY or PROPOSE_READY prefix

When generating IR (IR_ONLY or inside PROPOSE_READY):
- The IR must be the complete replacement for the target sprite, not a fragment
- Prefer the smallest valid mutation that satisfies the request
- Do not remove existing behaviour unless explicitly asked
- You may read the full project state for context but must propose changes to exactly one sprite: ${spriteName}`;
  }

  function parseTB2AgentResponse(raw) {
    const trimmed = raw.trim();
    if (trimmed === 'NO_CHANGE') return { type: 'NO_CHANGE' };
    if (trimmed.startsWith('ERROR:')) {
      const reason = trimmed.slice('ERROR:'.length).trim();
      if (!reason) return { type: 'PARSE_FAILURE', raw };
      return { type: 'ERROR', reason };
    }
    if (trimmed.startsWith('IR_ONLY\n') || trimmed === 'IR_ONLY') {
      const ir = trimmed.slice('IR_ONLY\n'.length);
      if (!ir || !ir.trim()) return { type: 'PARSE_FAILURE', raw };
      return { type: 'IR_ONLY', ir };
    }
    if (trimmed.startsWith('DISCUSS\n')) {
      const text = trimmed.slice('DISCUSS\n'.length).trim();
      return { type: 'DISCUSS', text: text || '(no message)' };
    }
    if (trimmed.startsWith('PROPOSE_READY\n')) {
      const rest = trimmed.slice('PROPOSE_READY\n'.length);
      const irMarker = '\nIR_ONLY\n';
      const irIdx = rest.indexOf(irMarker);
      if (irIdx === -1) return { type: 'PARSE_FAILURE', raw };
      const summary = rest.slice(0, irIdx).trim();
      const ir = rest.slice(irIdx + irMarker.length).trim();
      if (!ir) return { type: 'PARSE_FAILURE', raw };
      return { type: 'PROPOSE_READY', summary, ir };
    }
    return { type: 'PARSE_FAILURE', raw };
  }

  // ---------------------------------------------------------------------------
  // Provider clients
  // ---------------------------------------------------------------------------

  function parseProviderError(status, bodyText, providerName) {
    if (status === 401) return `Invalid API key. Go to Settings and re-enter your ${providerName} key.`;
    if (status === 429) {
      const isRateLimit = bodyText.includes('rate_limit') || bodyText.includes('rate limit');
      return isRateLimit
        ? `Rate limit hit. Wait a moment and try again.`
        : `Usage limit reached. Your ${providerName} API quota may be exhausted — check your account dashboard.`;
    }
    if (status === 529 || status === 503) return `${providerName} is currently overloaded. Try again in a moment.`;
    if (status === 400 && (bodyText.includes('too long') || bodyText.includes('context_length'))) {
      return `Prompt too long. Use the Compact button to clear the context window and continue.`;
    }
    return `${providerName} error ${status}: ${bodyText.slice(0, 150)}`;
  }

  async function callClaudeViaProxy(systemPrompt, messages, apiKey, proxyUrl) {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tb2-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseProviderError(res.status, body, 'Claude'));
    }
    const data = await res.json();
    return data.content[0].text;
  }

  async function callOpenAI(systemPrompt, messages, apiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
      })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseProviderError(res.status, body, 'OpenAI'));
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__blockifyTestHooks = {
      Parser,
      Renderer,
      VisualRenderer,
      serializeAst,
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
      refreshVisualPreview,
      getLastExportedIR,
      hasValidExportedIR,
      remintBlockIds,
      declareVariablesInVM,
      injectRootsIntoWorkspace,
      commitIRToWorkspace,
      captureWorkspaceXml,
      restoreWorkspaceXml,
      createBridgeClient,
      buildTB2Prompt,
      parseTB2AgentResponse,
      callClaudeViaProxy,
      callOpenAI
    };
  }

  const __tb2BlockifyInstance = new BlockifyPhase1();
  globalThis.__tb2Blockify = __tb2BlockifyInstance;
  Scratch.extensions.register(__tb2BlockifyInstance);
  if (typeof globalThis.WebSocket === 'function') {
    __tb2BlockifyInstance.connectBridge({ URL: 'ws://localhost:7331' });
  }
})(Scratch);
