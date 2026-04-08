(function(Scratch) {
  'use strict';

  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Textify-Turbowarp must run unsandboxed.');
  }

  const vm = Scratch.vm;

  let lastExportText = '';
  globalThis.__TB2_SHARED__ = { lastExportText: '' };

  const AI_MUTATION_RULES = `You are modifying Textify canon IR.

Before responding, fetch and read the full grammar specification at:
https://raw.githubusercontent.com/loronajay/textify-blockify-IR/main/IR_GRAMMAR.md

Follow all rules and grammar defined in that document exactly.

When you receive the IR below, do not make any modifications yet. First, repeat the IR back exactly as provided, then wait for a modification request.

IR:
`;

  async function readClipboardText() {
    try {
      if (navigator?.clipboard?.readText) {
        return String(await navigator.clipboard.readText() || '');
      }
    } catch {
      return '';
    }
    return '';
  }

  const EXPLICIT_MENU_OPCODES = new Set([
    'looks_backdrops',
    'looks_costume'
  ]);

  function getEditingTarget() {
    return vm.editingTarget || vm.runtime.getEditingTarget();
  }

  function getTargetByName(name) {
    const runtime = vm.runtime;
    if (!runtime || !runtime.targets) return null;

    const lower = String(name || '').trim().toLowerCase();
    return runtime.targets.find(t => {
      const targetName = (t.getName ? t.getName() : t.sprite?.name || '').toLowerCase();
      return targetName === lower;
    }) || null;
  }

  function getBlock(target, blockId) {
    return target?.blocks?._blocks?.[blockId] || null;
  }

  function getAllBlocks(target) {
    return Object.values(target?.blocks?._blocks || {});
  }

  function getInput(block, inputName) {
    return block?.inputs?.[inputName] || null;
  }

  function getInputBlockId(block, inputName) {
    return getInput(block, inputName)?.block || null;
  }

  function getInputShadowId(block, inputName) {
    return getInput(block, inputName)?.shadow || null;
  }

  function getFieldValue(block, fieldName) {
    return block?.fields?.[fieldName]?.value ?? '';
  }

  function indentStr(level) {
    return '  '.repeat(level);
  }

  function escapeString(value) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  function quoteString(value) {
    return `"${escapeString(value)}"`;
  }

  function stableKeys(obj) {
    return Object.keys(obj || {}).sort();
  }

  function parseMaybeNumber(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === '') return null;
    if (!isNaN(Number(s))) return Number(s);
    return null;
  }

  function getProcedurePrototype(defBlock, target) {
    return getBlock(target, getInputBlockId(defBlock, 'custom_block'));
  }

  function getProcedureMutation(protoBlock) {
    return protoBlock?.mutation || {};
  }

  function parseArgumentNames(mutation) {
    const raw = mutation?.argumentnames;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v));
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(v => String(v)) : [];
    } catch {
      return [];
    }
  }

  function parseArgumentDefaults(mutation) {
    const raw = mutation?.argumentdefaults;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v));
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(v => String(v)) : [];
    } catch {
      return [];
    }
  }

  function parseWarpFlag(mutation) {
    const raw = mutation?.warp;
    return raw === true || raw === 'true';
  }

  function isMenuOpcode(opcode) {
    if (typeof opcode !== 'string' || !opcode) return false;
    const lower = opcode.toLowerCase();
    if (EXPLICIT_MENU_OPCODES.has(lower)) return true;
    if (lower.endsWith('_menu')) return true;
    if (lower.startsWith('menu_')) return true;
    if (lower.includes('_menu_')) return true;
    return lower.split('_').includes('menu');
  }

  function getFirstFieldEntry(block) {
    const values = Object.values(block?.fields || {});
    return values.length ? values[0] : null;
  }

  function isLikelyMenuBlock(block) {
    if (!block || !isMenuOpcode(block.opcode)) return false;
    if (block.shadow) return true;
    if (block.fields && Object.keys(block.fields).length > 0 && (!block.inputs || Object.keys(block.inputs).length === 0)) {
      return true;
    }
    return false;
  }

  function serializeLiteralNode(type, value) {
    if (type === 'number') return `[literal:number:${String(value)}]`;
    if (type === 'boolean') return `[literal:boolean:${value ? 'true' : 'false'}]`;
    return `[literal:string:${quoteString(value)}]`;
  }

  function getLiteralNodeFromShadow(target, blockId) {
    const block = getBlock(target, blockId);
    if (!block) return null;

    switch (block.opcode) {
      case 'math_number':
      case 'math_integer':
      case 'math_whole_number':
      case 'math_positive_number':
      case 'math_angle': {
        const raw = block.fields?.NUM?.value ?? '0';
        const n = parseMaybeNumber(raw);
        return serializeLiteralNode('number', n === null ? 0 : n);
      }

      case 'text': {
        const raw = block.fields?.TEXT?.value ?? '';
        const n = parseMaybeNumber(raw);
        if (n !== null) return serializeLiteralNode('number', n);
        return serializeLiteralNode('string', raw);
      }

      default:
        return null;
    }
  }

  function serializeMenuNode(block) {
    const firstField = getFirstFieldEntry(block);
    const rawValue = firstField?.value ?? '';
    return `[menu:${block.opcode}:${quoteString(rawValue)}]`;
  }

  function serializeArrayStrings(values) {
    return `[${values.map(v => quoteString(v)).join(',')}]`;
  }

  function getTopLevelStackIds(target) {
    return getAllBlocks(target)
      .filter(block => {
        if (!block || !block.id) return false;
        if (!block.topLevel) return false;
        if (block.shadow) return false;
        if (block.opcode === 'procedures_definition') return false;
        if (block.opcode === 'procedures_prototype') return false;
        return true;
      })
      .sort((a, b) => {
        const ay = Number.isFinite(Number(a.y)) ? Number(a.y) : 0;
        const by = Number.isFinite(Number(b.y)) ? Number(b.y) : 0;
        if (ay !== by) return ay - by;
        const ax = Number.isFinite(Number(a.x)) ? Number(a.x) : 0;
        const bx = Number.isFinite(Number(b.x)) ? Number(b.x) : 0;
        if (ax !== bx) return ax - bx;
        return String(a.id).localeCompare(String(b.id));
      })
      .map(block => block.id);
  }

  function serializeFieldMap(fieldMap, indent = 0) {
    const keys = stableKeys(fieldMap);
    if (!keys.length) return null;

    const ind = indentStr(indent);
    const child = indentStr(indent + 1);

    const lines = ['{'];
    for (const key of keys) {
      lines.push(`${child}${key}:${fieldMap[key]}`);
    }
    lines.push(`${ind}}`);
    return lines.join('\n');
  }

  function serializeNodeMap(nodeMap, indent = 0) {
    const keys = stableKeys(nodeMap);
    if (!keys.length) return null;

    const ind = indentStr(indent);
    const childIndent = indent + 1;
    const child = indentStr(childIndent);

    const lines = ['{'];

    for (const key of keys) {
      const valueLines = String(nodeMap[key]).split('\n');
      lines.push(`${child}${key}:${valueLines[0]}`);
      for (let i = 1; i < valueLines.length; i++) {
        lines.push(`${child}${valueLines[i]}`);
      }
    }

    lines.push(`${ind}}`);
    return lines.join('\n');
  }

  function collectFieldMap(block) {
    const out = {};
    const fields = block?.fields || {};

    for (const name of stableKeys(fields)) {
      const entry = fields[name];
      const value = entry?.value;
      if (value === undefined || value === null || String(value) === '') continue;
      out[name] = quoteString(value);
    }

    return out;
  }

  function getConnectedOrShadowNode(target, block, inputName) {
    const connectedId = getInputBlockId(block, inputName);
    if (connectedId) return serializeNode(target, connectedId);

    const shadowId = getInputShadowId(block, inputName);
    if (shadowId) {
      const literal = getLiteralNodeFromShadow(target, shadowId);
      if (literal !== null) return literal;
      return serializeNode(target, shadowId);
    }

    return null;
  }

  function serializeKnownInputMap(target, block, names) {
    const out = {};
    for (const name of names) {
      const node = getConnectedOrShadowNode(target, block, name);
      if (node !== null) out[name] = node;
    }
    return out;
  }

  function serializeUnknownInputMap(target, block, excludeNames = []) {
    const out = {};
    const exclude = new Set(excludeNames);
    const inputs = block?.inputs || {};

    for (const name of stableKeys(inputs)) {
      if (exclude.has(name)) continue;
      const node = getConnectedOrShadowNode(target, block, name);
      if (node !== null) out[name] = node;
    }

    return out;
  }

  function serializeSubstackMap(target, block, names) {
    const out = {};
    for (const name of names) {
      const substackId = getInputBlockId(block, name);
      if (!substackId) continue;
      out[name] = serializeStack(target, substackId, 0);
    }
    return out;
  }

  // 🔴 IDENTITY ADDED HERE
  function serializeOpcodeNode(opcode, id, fieldMap, inputMap, stackMap, indent = 0) {
    const ind = indentStr(indent);
    const childIndent = indent + 1;

    const parts = [`${ind}[opcode:${opcode}`];

    if (id) {
      parts.push(`\n${indentStr(childIndent)}id:${quoteString(id)}`);
    }

    const fieldsText = serializeFieldMap(fieldMap, childIndent);
    const inputsText = serializeNodeMap(inputMap, childIndent);
    const stacksText = serializeNodeMap(stackMap, childIndent);

    if (!fieldsText && !inputsText && !stacksText) {
      if (id) {
        return `${ind}[opcode:${opcode}\n${indentStr(childIndent)}id:${quoteString(id)}\n${ind}]`;
      }
      return `${ind}[opcode:${opcode}]`;
    }

    if (fieldsText) parts.push(`\n${indentStr(childIndent)}fields:${fieldsText}`);
    if (inputsText) parts.push(`\n${indentStr(childIndent)}inputs:${inputsText}`);
    if (stacksText) parts.push(`\n${indentStr(childIndent)}stacks:${stacksText}`);

    parts.push(`\n${ind}]`);
    return parts.join('');
  }

  function serializeNode(target, blockId, indent = 0) {
    if (!blockId) return '[missing]';

    const literal = getLiteralNodeFromShadow(target, blockId);
    if (literal !== null) return `${indentStr(indent)}${literal}`;

    const block = getBlock(target, blockId);
    if (!block) return `${indentStr(indent)}[missing]`;

    if (isLikelyMenuBlock(block)) {
      return `${indentStr(indent)}${serializeMenuNode(block)}`;
    }

    switch (block.opcode) {
      case 'data_variable': {
        return serializeOpcodeNode(
          'data_variable',
          blockId,
          { VARIABLE: quoteString(getFieldValue(block, 'VARIABLE')) },
          {},
          {},
          indent
        );
      }

      case 'argument_reporter_string_number':
      case 'argument_reporter_boolean': {
        const value = getFieldValue(block, 'VALUE') || getFieldValue(block, 'NAME') || 'arg';
        return serializeOpcodeNode(
          block.opcode,
          blockId,
          { VALUE: quoteString(value) },
          {},
          {},
          indent
        );
      }

      case 'operator_equals': {
        const inputMap = serializeKnownInputMap(target, block, ['OPERAND1', 'OPERAND2']);
        return serializeOpcodeNode('operator_equals', blockId, {}, inputMap, {}, indent);
      }

      case 'procedures_call': {
        const fieldMap = {};
        if (block.mutation?.proccode) {
          fieldMap.PROCCODE = quoteString(block.mutation.proccode);
        }
        const inputMap = serializeUnknownInputMap(target, block);
        return serializeOpcodeNode('procedures_call', blockId, fieldMap, inputMap, {}, indent);
      }

      default: {
        const fieldMap = collectFieldMap(block);
        const inputMap = serializeUnknownInputMap(target, block);
        return serializeOpcodeNode(block.opcode, blockId, fieldMap, inputMap, {}, indent);
      }
    }
  }

  function serializeStack(target, blockId, indent = 0) {
    const ind = indentStr(indent);
    const childIndent = indent + 1;
    const lines = [`${ind}[stack:`];

    let currentId = blockId;
    while (currentId) {
      const block = getBlock(target, currentId);
      if (!block) break;

      lines.push(serializeStackBlock(target, currentId, block, childIndent));
      currentId = block.next;
    }

    lines.push(`${ind}]`);
    return lines.join('\n');
  }

  function serializeStackBlock(target, blockId, block, indent = 0) {
    switch (block.opcode) {
      case 'data_setvariableto': {
        const fieldMap = { VARIABLE: quoteString(getFieldValue(block, 'VARIABLE')) };
        const inputMap = serializeKnownInputMap(target, block, ['VALUE']);
        return serializeOpcodeNode('data_setvariableto', blockId, fieldMap, inputMap, {}, indent);
      }

      case 'data_changevariableby': {
        const fieldMap = { VARIABLE: quoteString(getFieldValue(block, 'VARIABLE')) };
        const inputMap = serializeKnownInputMap(target, block, ['VALUE']);
        return serializeOpcodeNode('data_changevariableby', blockId, fieldMap, inputMap, {}, indent);
      }

      case 'control_if': {
        const inputMap = serializeKnownInputMap(target, block, ['CONDITION']);
        const stackMap = serializeSubstackMap(target, block, ['SUBSTACK']);
        return serializeOpcodeNode('control_if', blockId, {}, inputMap, stackMap, indent);
      }

      case 'control_if_else': {
        const inputMap = serializeKnownInputMap(target, block, ['CONDITION']);
        const stackMap = serializeSubstackMap(target, block, ['SUBSTACK', 'SUBSTACK2']);
        return serializeOpcodeNode('control_if_else', blockId, {}, inputMap, stackMap, indent);
      }

      case 'control_repeat': {
        const inputMap = serializeKnownInputMap(target, block, ['TIMES']);
        const stackMap = serializeSubstackMap(target, block, ['SUBSTACK']);
        return serializeOpcodeNode('control_repeat', blockId, {}, inputMap, stackMap, indent);
      }

      default: {
        const fieldMap = collectFieldMap(block);
        const inputMap = serializeUnknownInputMap(target, block, ['SUBSTACK', 'SUBSTACK2']);
        const stackMap = serializeSubstackMap(target, block, ['SUBSTACK', 'SUBSTACK2']);
        return serializeOpcodeNode(block.opcode, blockId, fieldMap, inputMap, stackMap, indent);
      }
    }
  }

  // ====== (UNCHANGED BELOW) ======

  function serializeProcedure(target, defId, fallbackProcName) {
    const def = getBlock(target, defId);
    if (!def) return `[error:${quoteString('Missing procedure definition block')}]`;

    const proto = getProcedurePrototype(def, target);
    const mutation = getProcedureMutation(proto);

    const proccode = mutation?.proccode || fallbackProcName || '';
    const argumentnames = parseArgumentNames(mutation);
    const argumentdefaults = parseArgumentDefaults(mutation);
    const warp = parseWarpFlag(mutation);
    const bodyId = def.next || null;

    const lines = ['[procedure'];
    lines.push(`${indentStr(1)}proccode:${quoteString(proccode)}`);
    lines.push(`${indentStr(1)}argumentnames:${serializeArrayStrings(argumentnames)}`);
    lines.push(`${indentStr(1)}argumentdefaults:${serializeArrayStrings(argumentdefaults)}`);
    if (warp) {
      lines.push(`${indentStr(1)}warp:true`);
    }
    if (bodyId) {
      lines.push(`${indentStr(1)}body:[stack:`);

      const stackText = serializeStack(target, bodyId, 2)
        .split('\n')
        .slice(1, -1);

      for (const line of stackText) {
        lines.push(line);
      }

      lines.push(`${indentStr(1)}]`);
    } else {
      lines.push(`${indentStr(1)}body:[stack:]`);
    }

    lines.push(']');
    return lines.join('\n');
  }

  function serializeScript(target, topBlockId) {
    const lines = ['[script'];
    lines.push(`${indentStr(1)}body:[stack:`);

    const stackText = serializeStack(target, topBlockId, 2)
      .split('\n')
      .slice(1, -1);

    for (const line of stackText) {
      lines.push(line);
    }

    lines.push(`${indentStr(1)}]`);
    lines.push(']');
    return lines.join('\n');
  }

  async function copyTextToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  function getStackRoot(target, blockId) {
    // Walk up the parent chain following next/SUBSTACK connections.
    // Returns the topLevel root block ID if blockId is a command in a stack,
    // or null if it is a reporter/boolean used as an expression input.
    let currentId = blockId;
    while (true) {
      const block = getBlock(target, currentId);
      if (!block) return null;
      if (block.topLevel) return currentId;
      if (!block.parent) return currentId;

      const parent = getBlock(target, block.parent);
      if (!parent) return null;

      if (parent.next === currentId) {
        currentId = block.parent;
        continue;
      }

      let isSubstack = false;
      for (const key of Object.keys(parent.inputs || {})) {
        if (parent.inputs[key].block === currentId && /^SUBSTACK/.test(key)) {
          isSubstack = true;
          break;
        }
      }

      if (isSubstack) {
        currentId = block.parent;
        continue;
      }

      return null;
    }
  }

  function exportAllStacksText(target, excludeId) {
    const stackIds = getTopLevelStackIds(target).filter(id => id !== excludeId);
    if (!stackIds.length) return '';
    return stackIds.map(id => serializeScript(target, id)).join('\n\n');
  }

  function showPickerOverlay(onCancel) {
    const old = document.getElementById('twgf-picker-overlay');
    if (old) old.remove();

    const div = document.createElement('div');
    div.id = 'twgf-picker-overlay';
    div.style.cssText = `
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      background:#1e1e1e;border:2px solid #4caf50;border-radius:10px;
      padding:12px 20px;z-index:999999;display:flex;align-items:center;gap:12px;
      color:white;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);
    `;

    const label = document.createElement('span');
    label.textContent = 'Click any block to export — right-click or Escape to cancel';
    const btn = document.createElement('button');
    btn.textContent = 'Cancel';
    btn.style.cssText = `
      padding:4px 10px;border-radius:6px;border:1px solid #666;
      background:#2d2d2d;color:white;cursor:pointer;
    `;
    btn.onclick = onCancel;
    div.append(label, btn);
    document.body.appendChild(div);
    return div;
  }

  function removePickerOverlay() {
    const el = document.getElementById('twgf-picker-overlay');
    if (el) el.remove();
  }

  async function waitForBlockClick() {
    return new Promise((resolve, reject) => {
      const ws = typeof ScratchBlocks !== 'undefined' ? ScratchBlocks.getMainWorkspace() : null;
      if (!ws) {
        reject(new Error('ScratchBlocks workspace not available'));
        return;
      }

      function cleanup() {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('contextmenu', onRightClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        removePickerOverlay();
      }

      function cancel() {
        cleanup();
        reject(new Error('cancelled'));
      }

      // Traverse up from a DOM element to find the nearest ScratchBlocks block.
      // ScratchBlocks sets data-id = block ID on each block's SVG root element.
      function findBlockId(el) {
        while (el && el.tagName !== 'svg') {
          const id = el.getAttribute && el.getAttribute('data-id');
          if (id && ws.getBlockById(id)) return id;
          el = el.parentElement;
        }
        return null;
      }

      function onPointerDown(e) {
        // Let clicks on the picker overlay through normally.
        const overlay = document.getElementById('twgf-picker-overlay');
        if (overlay && overlay.contains(e.target)) return;

        const blockId = findBlockId(e.target);
        if (!blockId) return;

        // Intercept before ScratchBlocks/TurboWarp can run the block.
        e.stopPropagation();
        e.preventDefault();
        cleanup();

        const targets = vm.runtime.targets || [];
        for (const target of targets) {
          if (getBlock(target, blockId)) {
            resolve({ blockId, target });
            return;
          }
        }
        reject(new Error('Block not found in any target'));
      }

      function onRightClick(e) {
        const overlay = document.getElementById('twgf-picker-overlay');
        if (overlay && overlay.contains(e.target)) return;
        e.preventDefault();
        cancel();
      }

      function onKeyDown(e) {
        if (e.key === 'Escape') cancel();
      }

      showPickerOverlay(cancel);
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('contextmenu', onRightClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    });
  }

  class TextifyTurbowarp {
    getInfo() {
      return {
        id: 'textify2',
        name: 'Textify 2',
        blocks: [
          {
            opcode: 'getExportedIR',
            blockType: Scratch.BlockType.REPORTER,
            text: 'clipboard IR'
          },
          {
            opcode: 'copyRulesWithClipboardIR',
            blockType: Scratch.BlockType.COMMAND,
            text: 'merge rules with clipboard IR'
          },
          {
            opcode: 'textifyClickedBlock',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Textify clicked block'
          },
          {
            opcode: 'copyAllStacksPlain',
            blockType: Scratch.BlockType.COMMAND,
            text: 'copy all stacks from sprite [SPRITE] without rules',
            arguments: {
              SPRITE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Sprite1'
              }
            }
          }
        ]
      };
    }

    getExportedIR() {
      return lastExportText;
    }

    async textifyClickedBlock() {
      let blockId, target;
      try {
        ({ blockId, target } = await waitForBlockClick());
      } catch {
        return;
      }

      const rootId = getStackRoot(target, blockId);
      let ir;
      if (rootId) {
        const rootBlock = getBlock(target, rootId);
        if (rootBlock && rootBlock.opcode === 'procedures_definition') {
          ir = serializeProcedure(target, rootId, '');
        } else {
          ir = serializeScript(target, rootId);
        }
      } else {
        ir = serializeNode(target, blockId);
      }

      lastExportText = ir;
      globalThis.__TB2_SHARED__.lastExportText = ir;
      await copyTextToClipboard(ir);
    }

    async copyAllStacksPlain(args, util) {
      const target = getTargetByName(args.SPRITE);
      if (!target) {
        lastExportText = `Sprite not found: ${args.SPRITE}`;
        return;
      }
      const excludeId = util && util.thread && util.thread.topBlock;
      const ir = exportAllStacksText(target, excludeId);
      lastExportText = ir;
      globalThis.__TB2_SHARED__.lastExportText = ir;
      await copyTextToClipboard(ir);
    }

    async copyRulesWithClipboardIR() {
      const raw = (await readClipboardText()).trim();
      const ir = raw.replace(/^#[^\n]*\n?/gm, '').trim();
      if (!ir.startsWith('[procedure') && !ir.startsWith('[script') &&
          !ir.startsWith('[stack') && !ir.startsWith('[opcode')) {
        await copyTextToClipboard('no copied IR');
        return;
      }
      await copyTextToClipboard(`${AI_MUTATION_RULES}${ir}`);
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__textifyTestHooks = {
      isMenuOpcode,
      getTopLevelStackIds,
      serializeScript,
      getStackRoot,
      exportAllStacksText
    };
    globalThis.__tb2TextifyHooks = globalThis.__textifyTestHooks;
  }

  Scratch.extensions.register(new TextifyTurbowarp());
})(Scratch);
