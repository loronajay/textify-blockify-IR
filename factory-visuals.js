(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Factory Visuals v2 must run unsandboxed.');
    }

    const vm = Scratch.vm;
    const runtime = vm.runtime;

    const EFFECT_MENU = ['blink', 'shake', 'pulse', 'brightness flicker'];
    const ON_OFF_MENU = ['on', 'off'];

    const BASE_EFFECT_INTERVALS = {
        blink: 100,
        shake: 40,
        pulse: 40,
        'brightness flicker': 60
    };

    const states = new Map();

    function clampNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function clampSeconds(value) {
        return Math.max(0, clampNumber(value, 0));
    }

    function clampSpeed(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    function getEffectInterval(effect, speed) {
        const base = BASE_EFFECT_INTERVALS[effect] || 40;
        const safeSpeed = clampSpeed(speed);
        return Math.max(10, Math.round(base / safeSpeed));
    }

    function asOnOff(value) {
        return String(value).toLowerCase() === 'on';
    }

    function getSpriteMenuItems() {
        const seen = new Set();
        const items = [];

        for (const target of runtime.targets || []) {
            if (!target || target.isStage) continue;
            if (!target.isOriginal) continue;

            const name = typeof target.getName === 'function' ? target.getName() : target.sprite?.name;
            if (!name || seen.has(name)) continue;

            seen.add(name);
            items.push({
                text: name,
                value: name
            });
        }

        if (items.length === 0) {
            return [{ text: '', value: '' }];
        }

        return items;
    }

    function getSpriteTargetByName(name) {
        const targetName = String(name || '').trim();
        if (!targetName) return null;

        if (typeof runtime.getSpriteTargetByName === 'function') {
            const target = runtime.getSpriteTargetByName(targetName);
            if (target && !target.isStage && target.isOriginal) {
                return target;
            }
        }

        for (const target of runtime.targets || []) {
            if (!target || target.isStage) continue;
            if (!target.isOriginal) continue;

            const currentName = typeof target.getName === 'function' ? target.getName() : target.sprite?.name;
            if (currentName === targetName) {
                return target;
            }
        }

        return null;
    }

    function getTargetState(target) {
        if (!target) return null;

        let state = states.get(target.id);
        if (!state) {
            state = {
                hFlip: false,
                vFlip: false,

                activeEffect: 'none',
                effectRunId: 0,
                effectInterval: null,
                effectTimeout: null,
                effectRestore: null,

                hFlipRunId: 0,
                vFlipRunId: 0,

                visibilityRunId: 0,
                visibilityTimeouts: new Set(),

                patched: false,
                originalGetRenderedDirectionAndScale: null
            };
            states.set(target.id, state);
        }

        patchTarget(target, state);
        return state;
    }

    function patchTarget(target, state) {
        if (!target || state.patched) return;
        if (target.isStage) {
            state.patched = true;
            return;
        }

        const original = target._getRenderedDirectionAndScale;
        if (typeof original !== 'function') {
            state.patched = true;
            return;
        }

        state.originalGetRenderedDirectionAndScale = original;
        target._getRenderedDirectionAndScale = function () {
            const result = original.call(this);
            if (!result || !Array.isArray(result.scale)) return result;

            const liveState = states.get(this.id);
            if (!liveState) return result;

            const scale = result.scale.slice();
            if (liveState.hFlip) scale[0] *= -1;
            if (liveState.vFlip) scale[1] *= -1;
            result.scale = scale;
            return result;
        };

        state.patched = true;
        forceVisualRefresh(target);
    }

    function forceVisualRefresh(target) {
        if (!target || target.isStage) return;

        try {
            if (typeof target.setDirection === 'function') {
                target.setDirection(target.direction);
                return;
            }
        } catch (e) {}

        try {
            if (typeof target.emitVisualChange === 'function') {
                target.emitVisualChange();
            }
            runtime.requestRedraw();
        } catch (e) {}
    }

    function stopEffect(target, state) {
        if (!state) return;

        state.effectRunId++;

        if (state.effectInterval !== null) {
            clearInterval(state.effectInterval);
            state.effectInterval = null;
        }

        if (state.effectTimeout !== null) {
            clearTimeout(state.effectTimeout);
            state.effectTimeout = null;
        }

        if (typeof state.effectRestore === 'function') {
            try {
                state.effectRestore();
            } catch (e) {}
        }

        state.effectRestore = null;
        state.activeEffect = 'none';
        forceVisualRefresh(target);
    }

    function stopAllTimersForTarget(target, state) {
        stopEffect(target, state);

        state.hFlipRunId++;
        state.vFlipRunId++;
        state.visibilityRunId++;

        for (const timeoutId of state.visibilityTimeouts) {
            clearTimeout(timeoutId);
        }
        state.visibilityTimeouts.clear();
    }

    function resetVisuals(target) {
        const state = getTargetState(target);
        if (!state || target.isStage) return;

        stopAllTimersForTarget(target, state);

        state.hFlip = false;
        state.vFlip = false;

        try {
            if (typeof target.setVisible === 'function') {
                target.setVisible(true);
            }
        } catch (e) {}

        forceVisualRefresh(target);
    }

    function setHorizontalFlip(target, value) {
        const state = getTargetState(target);
        if (!state || target.isStage) return;
        state.hFlip = !!value;
        forceVisualRefresh(target);
    }

    function setVerticalFlip(target, value) {
        const state = getTargetState(target);
        if (!state || target.isStage) return;
        state.vFlip = !!value;
        forceVisualRefresh(target);
    }

    function startTemporaryFlip(target, axis, seconds) {
        const state = getTargetState(target);
        if (!state || target.isStage) return Promise.resolve();

        const duration = clampSeconds(seconds) * 1000;
        const isHorizontal = axis === 'horizontal';
        const runIdKey = isHorizontal ? 'hFlipRunId' : 'vFlipRunId';
        const originalValue = isHorizontal ? state.hFlip : state.vFlip;

        state[runIdKey]++;
        const myRunId = state[runIdKey];

        if (isHorizontal) {
            state.hFlip = !state.hFlip;
        } else {
            state.vFlip = !state.vFlip;
        }
        forceVisualRefresh(target);

        return new Promise(resolve => {
            setTimeout(() => {
                const liveState = getTargetState(target);
                if (!liveState) {
                    resolve();
                    return;
                }

                if (liveState[runIdKey] === myRunId) {
                    if (isHorizontal) {
                        liveState.hFlip = originalValue;
                    } else {
                        liveState.vFlip = originalValue;
                    }
                    forceVisualRefresh(target);
                }

                resolve();
            }, duration);
        });
    }

    function startTemporaryVisibility(target, mode, seconds) {
        const state = getTargetState(target);
        if (!state || target.isStage) return Promise.resolve();

        const duration = clampSeconds(seconds) * 1000;
        const originalVisible = !!target.visible;
        const myRunId = ++state.visibilityRunId;

        try {
            if (typeof target.setVisible === 'function') {
                target.setVisible(mode === 'show');
            }
        } catch (e) {}

        return new Promise(resolve => {
            const timeoutId = setTimeout(() => {
                state.visibilityTimeouts.delete(timeoutId);

                const liveState = getTargetState(target);
                if (!liveState) {
                    resolve();
                    return;
                }

                if (liveState.visibilityRunId === myRunId) {
                    try {
                        if (typeof target.setVisible === 'function') {
                            target.setVisible(originalVisible);
                        }
                    } catch (e) {}
                }

                resolve();
            }, duration);

            state.visibilityTimeouts.add(timeoutId);
        });
    }

    function setBrightness(target, value) {
        try {
            if (typeof target.setEffect === 'function') {
                target.setEffect('brightness', value);
                return true;
            }
        } catch (e) {}

        try {
            if (target.effects) {
                target.effects.brightness = value;
                if (typeof target.emitVisualChange === 'function') {
                    target.emitVisualChange();
                }
                runtime.requestRedraw();
                return true;
            }
        } catch (e) {}

        return false;
    }

    function getBrightness(target) {
        try {
            if (target.effects && Number.isFinite(target.effects.brightness)) {
                return target.effects.brightness;
            }
        } catch (e) {}

        return 0;
    }

    function setGhost(target, value) {
        try {
            if (typeof target.setEffect === 'function') {
                target.setEffect('ghost', value);
                return true;
            }
        } catch (e) {}

        try {
            if (target.effects) {
                target.effects.ghost = value;
                if (typeof target.emitVisualChange === 'function') {
                    target.emitVisualChange();
                }
                runtime.requestRedraw();
                return true;
            }
        } catch (e) {}

        return false;
    }

    function getGhost(target) {
        try {
            if (target.effects && Number.isFinite(target.effects.ghost)) {
                return target.effects.ghost;
            }
        } catch (e) {}

        return 0;
    }

    function startEffect(target, effect, seconds, speed) {
        const state = getTargetState(target);
        if (!state || target.isStage) return Promise.resolve();

        const safeEffect = EFFECT_MENU.includes(effect) ? effect : 'blink';
        const duration = clampSeconds(seconds) * 1000;
        const safeSpeed = clampSpeed(speed);
        const intervalMs = getEffectInterval(safeEffect, safeSpeed);

        stopEffect(target, state);

        const runId = ++state.effectRunId;
        state.activeEffect = safeEffect;

        if (safeEffect === 'blink') {
            const originalGhost = getGhost(target);
            let toggle = false;

            state.effectRestore = () => {
                setGhost(target, originalGhost);
            };

            state.effectInterval = setInterval(() => {
                const liveState = getTargetState(target);
                if (!liveState || liveState.effectRunId !== runId) return;

                toggle = !toggle;
                setGhost(target, toggle ? 100 : originalGhost);
            }, intervalMs);
        }

        if (safeEffect === 'shake') {
            const originalX = target.x;
            const originalY = target.y;

            state.effectRestore = () => {
                try {
                    if (typeof target.setXY === 'function') {
                        target.setXY(originalX, originalY);
                    }
                } catch (e) {}
            };

            state.effectInterval = setInterval(() => {
                const liveState = getTargetState(target);
                if (!liveState || liveState.effectRunId !== runId) return;

                const offsetX = Math.round((Math.random() * 8) - 4);
                const offsetY = Math.round((Math.random() * 8) - 4);

                try {
                    if (typeof target.setXY === 'function') {
                        target.setXY(originalX + offsetX, originalY + offsetY);
                    }
                } catch (e) {}
            }, intervalMs);
        }

        if (safeEffect === 'pulse') {
            const originalSize = target.size;
            const amplitude = 15;
            const startedAt = Date.now();

            state.effectRestore = () => {
                try {
                    if (typeof target.setSize === 'function') {
                        target.setSize(originalSize);
                    }
                } catch (e) {}
            };

            state.effectInterval = setInterval(() => {
                const liveState = getTargetState(target);
                if (!liveState || liveState.effectRunId !== runId) return;

                const elapsed = Date.now() - startedAt;
                const wave = Math.sin((elapsed / 100) * safeSpeed);
                const newSize = originalSize + (wave * amplitude);

                try {
                    if (typeof target.setSize === 'function') {
                        target.setSize(newSize);
                    }
                } catch (e) {}
            }, intervalMs);
        }

        if (safeEffect === 'brightness flicker') {
            const originalBrightness = getBrightness(target);
            let toggle = false;

            state.effectRestore = () => {
                setBrightness(target, originalBrightness);
            };

            state.effectInterval = setInterval(() => {
                const liveState = getTargetState(target);
                if (!liveState || liveState.effectRunId !== runId) return;

                toggle = !toggle;
                const flickerValue = toggle ? originalBrightness + 40 : originalBrightness - 20;
                setBrightness(target, flickerValue);
            }, intervalMs);
        }

        return new Promise(resolve => {
            state.effectTimeout = setTimeout(() => {
                const liveState = getTargetState(target);
                if (liveState && liveState.effectRunId === runId) {
                    stopEffect(target, liveState);
                }
                resolve();
            }, duration);
        });
    }

    function getValidTargetFromMenu(spriteName) {
        return getSpriteTargetByName(spriteName);
    }

    class FactoryVisuals {
        getInfo() {
            return {
                id: 'factoryvisuals',
                name: 'Factory Visuals',
                color1: '#7A4CFF',
                color2: '#693DDB',
                color3: '#5A31C2',
                blocks: [
                    {
                        opcode: 'flipHorizontally',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip horizontally'
                    },
                    {
                        opcode: 'flipVertically',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip vertically'
                    },
                    {
                        opcode: 'setHorizontalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set horizontal flip to [STATE]',
                        arguments: {
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'onOffMenu',
                                defaultValue: 'on'
                            }
                        }
                    },
                    {
                        opcode: 'setVerticalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set vertical flip to [STATE]',
                        arguments: {
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'onOffMenu',
                                defaultValue: 'on'
                            }
                        }
                    },
                    {
                        opcode: 'toggleHorizontalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'toggle horizontal flip'
                    },
                    {
                        opcode: 'toggleVerticalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'toggle vertical flip'
                    },

                    '---',

                    {
                        opcode: 'flipHorizontallyForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip horizontally for [SECONDS] seconds',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipVerticallyForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip vertically for [SECONDS] seconds',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipHorizontallyForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip horizontally for [SECONDS] seconds and wait',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipVerticallyForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip vertically for [SECONDS] seconds and wait',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'playVisualEffectForSecondsAtSpeed',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'play visual effect [TYPE] for [SECONDS] seconds at speed [SPEED]',
                        arguments: {
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectMenu',
                                defaultValue: 'blink'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            },
                            SPEED: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },
                    {
                        opcode: 'playVisualEffectForSecondsAtSpeedAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'play visual effect [TYPE] for [SECONDS] seconds at speed [SPEED] and wait',
                        arguments: {
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectMenu',
                                defaultValue: 'blink'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            },
                            SPEED: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'hideForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'hide for [SECONDS] seconds',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'showForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'show for [SECONDS] seconds',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'hideForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'hide for [SECONDS] seconds and wait',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'showForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'show for [SECONDS] seconds and wait',
                        arguments: {
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'resetVisuals',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'reset visuals'
                    },

                    '---',

                    {
                        opcode: 'isVisible',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is visible?'
                    },
                    {
                        opcode: 'isFlippedHorizontally',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is flipped horizontally?'
                    },
                    {
                        opcode: 'isFlippedVertically',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is flipped vertically?'
                    },
                    {
                        opcode: 'currentVisualEffect',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'current visual effect'
                    },

                    '---',

                    {
                        opcode: 'setSpriteHorizontalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set [SPRITE] horizontal flip to [STATE]',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'onOffMenu',
                                defaultValue: 'on'
                            }
                        }
                    },
                    {
                        opcode: 'setSpriteVerticalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set [SPRITE] vertical flip to [STATE]',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            STATE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'onOffMenu',
                                defaultValue: 'on'
                            }
                        }
                    },
                    {
                        opcode: 'toggleSpriteHorizontalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'toggle [SPRITE] horizontal flip',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },
                    {
                        opcode: 'toggleSpriteVerticalFlip',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'toggle [SPRITE] vertical flip',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'flipSpriteHorizontallyForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip [SPRITE] horizontally for [SECONDS] seconds',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipSpriteVerticallyForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip [SPRITE] vertically for [SECONDS] seconds',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipSpriteHorizontallyForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip [SPRITE] horizontally for [SECONDS] seconds and wait',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },
                    {
                        opcode: 'flipSpriteVerticallyForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'flip [SPRITE] vertically for [SECONDS] seconds and wait',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.2
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'playVisualEffectOnSpriteForSecondsAtSpeed',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'play visual effect [TYPE] on [SPRITE] for [SECONDS] seconds at speed [SPEED]',
                        arguments: {
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectMenu',
                                defaultValue: 'blink'
                            },
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            },
                            SPEED: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },
                    {
                        opcode: 'playVisualEffectOnSpriteForSecondsAtSpeedAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'play visual effect [TYPE] on [SPRITE] for [SECONDS] seconds at speed [SPEED] and wait',
                        arguments: {
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectMenu',
                                defaultValue: 'blink'
                            },
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            },
                            SPEED: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'hideSpriteForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'hide [SPRITE] for [SECONDS] seconds',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'showSpriteForSeconds',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'show [SPRITE] for [SECONDS] seconds',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'hideSpriteForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'hide [SPRITE] for [SECONDS] seconds and wait',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },
                    {
                        opcode: 'showSpriteForSecondsAndWait',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'show [SPRITE] for [SECONDS] seconds and wait',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            },
                            SECONDS: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0.5
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'resetSpriteVisuals',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'reset visuals of [SPRITE]',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },

                    '---',

                    {
                        opcode: 'isSpriteVisible',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is [SPRITE] visible?',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },
                    {
                        opcode: 'isSpriteFlippedHorizontally',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is [SPRITE] flipped horizontally?',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },
                    {
                        opcode: 'isSpriteFlippedVertically',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'is [SPRITE] flipped vertically?',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    },
                    {
                        opcode: 'currentVisualEffectOfSprite',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'current visual effect of [SPRITE]',
                        arguments: {
                            SPRITE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'spriteMenu'
                            }
                        }
                    }
                ],
                menus: {
                    onOffMenu: {
                        acceptReporters: true,
                        items: ON_OFF_MENU
                    },
                    effectMenu: {
                        acceptReporters: true,
                        items: EFFECT_MENU
                    },
                    spriteMenu: {
                        acceptReporters: false,
                        items: 'getSpriteMenu'
                    }
                }
            };
        }

        getSpriteMenu() {
            return getSpriteMenuItems();
        }

        flipHorizontally(args, util) {
            const target = util.target;
            const state = getTargetState(target);
            if (!state || target.isStage) return;
            state.hFlip = !state.hFlip;
            forceVisualRefresh(target);
        }

        flipVertically(args, util) {
            const target = util.target;
            const state = getTargetState(target);
            if (!state || target.isStage) return;
            state.vFlip = !state.vFlip;
            forceVisualRefresh(target);
        }

        setHorizontalFlip(args, util) {
            setHorizontalFlip(util.target, asOnOff(args.STATE));
        }

        setVerticalFlip(args, util) {
            setVerticalFlip(util.target, asOnOff(args.STATE));
        }

        toggleHorizontalFlip(args, util) {
            const target = util.target;
            const state = getTargetState(target);
            if (!state || target.isStage) return;
            state.hFlip = !state.hFlip;
            forceVisualRefresh(target);
        }

        toggleVerticalFlip(args, util) {
            const target = util.target;
            const state = getTargetState(target);
            if (!state || target.isStage) return;
            state.vFlip = !state.vFlip;
            forceVisualRefresh(target);
        }

        flipHorizontallyForSeconds(args, util) {
            startTemporaryFlip(util.target, 'horizontal', args.SECONDS);
        }

        flipVerticallyForSeconds(args, util) {
            startTemporaryFlip(util.target, 'vertical', args.SECONDS);
        }

        flipHorizontallyForSecondsAndWait(args, util) {
            return startTemporaryFlip(util.target, 'horizontal', args.SECONDS);
        }

        flipVerticallyForSecondsAndWait(args, util) {
            return startTemporaryFlip(util.target, 'vertical', args.SECONDS);
        }

        playVisualEffectForSecondsAtSpeed(args, util) {
            startEffect(util.target, args.TYPE, args.SECONDS, args.SPEED);
        }

        playVisualEffectForSecondsAtSpeedAndWait(args, util) {
            return startEffect(util.target, args.TYPE, args.SECONDS, args.SPEED);
        }

        hideForSeconds(args, util) {
            startTemporaryVisibility(util.target, 'hide', args.SECONDS);
        }

        showForSeconds(args, util) {
            startTemporaryVisibility(util.target, 'show', args.SECONDS);
        }

        hideForSecondsAndWait(args, util) {
            return startTemporaryVisibility(util.target, 'hide', args.SECONDS);
        }

        showForSecondsAndWait(args, util) {
            return startTemporaryVisibility(util.target, 'show', args.SECONDS);
        }

        resetVisuals(args, util) {
            resetVisuals(util.target);
        }

        isVisible(args, util) {
            return !!util.target.visible;
        }

        isFlippedHorizontally(args, util) {
            const state = getTargetState(util.target);
            return !!(state && state.hFlip);
        }

        isFlippedVertically(args, util) {
            const state = getTargetState(util.target);
            return !!(state && state.vFlip);
        }

        currentVisualEffect(args, util) {
            const state = getTargetState(util.target);
            return state ? state.activeEffect : 'none';
        }

        setSpriteHorizontalFlip(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            setHorizontalFlip(target, asOnOff(args.STATE));
        }

        setSpriteVerticalFlip(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            setVerticalFlip(target, asOnOff(args.STATE));
        }

        toggleSpriteHorizontalFlip(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;

            const state = getTargetState(target);
            if (!state) return;

            state.hFlip = !state.hFlip;
            forceVisualRefresh(target);
        }

        toggleSpriteVerticalFlip(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;

            const state = getTargetState(target);
            if (!state) return;

            state.vFlip = !state.vFlip;
            forceVisualRefresh(target);
        }

        flipSpriteHorizontallyForSeconds(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            startTemporaryFlip(target, 'horizontal', args.SECONDS);
        }

        flipSpriteVerticallyForSeconds(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            startTemporaryFlip(target, 'vertical', args.SECONDS);
        }

        flipSpriteHorizontallyForSecondsAndWait(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return Promise.resolve();
            return startTemporaryFlip(target, 'horizontal', args.SECONDS);
        }

        flipSpriteVerticallyForSecondsAndWait(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return Promise.resolve();
            return startTemporaryFlip(target, 'vertical', args.SECONDS);
        }

        playVisualEffectOnSpriteForSecondsAtSpeed(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            startEffect(target, args.TYPE, args.SECONDS, args.SPEED);
        }

        playVisualEffectOnSpriteForSecondsAtSpeedAndWait(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return Promise.resolve();
            return startEffect(target, args.TYPE, args.SECONDS, args.SPEED);
        }

        hideSpriteForSeconds(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            startTemporaryVisibility(target, 'hide', args.SECONDS);
        }

        showSpriteForSeconds(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            startTemporaryVisibility(target, 'show', args.SECONDS);
        }

        hideSpriteForSecondsAndWait(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return Promise.resolve();
            return startTemporaryVisibility(target, 'hide', args.SECONDS);
        }

        showSpriteForSecondsAndWait(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return Promise.resolve();
            return startTemporaryVisibility(target, 'show', args.SECONDS);
        }

        resetSpriteVisuals(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return;
            resetVisuals(target);
        }

        isSpriteVisible(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return false;
            return !!target.visible;
        }

        isSpriteFlippedHorizontally(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return false;

            const state = getTargetState(target);
            return !!(state && state.hFlip);
        }

        isSpriteFlippedVertically(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return false;

            const state = getTargetState(target);
            return !!(state && state.vFlip);
        }

        currentVisualEffectOfSprite(args) {
            const target = getValidTargetFromMenu(args.SPRITE);
            if (!target) return 'none';

            const state = getTargetState(target);
            return state ? state.activeEffect : 'none';
        }
    }

    const cleanupAll = () => {
        for (const target of runtime.targets || []) {
            const state = states.get(target.id);
            if (!state) continue;
            resetVisuals(target);
        }
    };

    runtime.on('PROJECT_START', cleanupAll);
    runtime.on('PROJECT_STOP_ALL', cleanupAll);

    Scratch.extensions.register(new FactoryVisuals());
})(Scratch);
