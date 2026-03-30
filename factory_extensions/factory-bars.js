(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Factory Bars must run unsandboxed.');
    }

    const vm = Scratch.vm;
    const runtime = vm.runtime;

    const NATIVE_H = 10;
    const BORDER_PX = 1;

    const DIRECTION_MENU = [
        { text: 'left \u2192 right', value: 'left-right' },
        { text: 'right \u2192 left', value: 'right-left' },
        { text: 'bottom \u2192 top', value: 'bottom-top' },
        { text: 'top \u2192 bottom', value: 'top-bottom' }
    ];

    const VALID_DIRECTIONS = new Set(['left-right', 'right-left', 'bottom-top', 'top-bottom']);

    function makeBarState() {
        return {
            value: 50,
            max: 100,
            x: 0,
            y: 0,
            width: 200,
            height: 40,
            scale: 1,
            roundness: 3,
            fillColor: '#00cc44',
            bgColor: '#222222',
            borderColor: '#666666',
            opacity: 100,
            direction: 'left-right',
            visible: true,
            followSprite: null,
            offsetX: 0,
            offsetY: 0
        };
    }

    class FactoryBars {
        constructor() {
            this.bars = new Map();

            this.canvas = document.createElement('canvas');
            const stage = this._getStageMetrics();
            this.canvas.width = stage.width;
            this.canvas.height = stage.height;
            this.ctx = this.canvas.getContext('2d', { alpha: true });

            this.skinId = null;
            this.drawableId = null;

            this._setupDrawable();

            runtime.on('PROJECT_STOP_ALL', () => {
                this.bars.clear();
                this._refresh();
            });

            runtime.on('PROJECT_START', () => {
                this.bars.clear();
                this._refresh();
            });

            runtime.on('AFTER_EXECUTE', () => {
                this._refresh();
            });
        }

        _getStageMetrics() {
            const w = Number(runtime.stageWidth);
            const h = Number(runtime.stageHeight);
            const width = (Number.isFinite(w) && w > 0) ? w : 480;
            const height = (Number.isFinite(h) && h > 0) ? h : 360;
            return { width, height, halfWidth: width / 2, halfHeight: height / 2 };
        }

        _ensureCanvasSize() {
            const stage = this._getStageMetrics();
            if (this.canvas.width !== stage.width || this.canvas.height !== stage.height) {
                this.canvas.width = stage.width;
                this.canvas.height = stage.height;
            }
            return stage;
        }

        _setupDrawable() {
            const renderer = runtime.renderer;
            if (!renderer) return;

            const stage = this._ensureCanvasSize();
            const rotationCenter = [stage.halfWidth, stage.halfHeight];

            if (this.skinId === null) {
                this.skinId = renderer.createBitmapSkin(this.canvas, 1, rotationCenter);
            }

            if (this.drawableId === null) {
                this.drawableId = renderer.createDrawable('sprite');
                renderer.updateDrawableSkinId(this.drawableId, this.skinId);
                renderer.updateDrawablePosition(this.drawableId, [0, 0]);
                renderer.updateDrawableVisible(this.drawableId, true);
                if (renderer.setDrawableOrder) {
                    try { renderer.setDrawableOrder(this.drawableId, Infinity, 'sprite'); } catch (e) {}
                }
            }

            this._pushCanvasToSkin();
        }

        _pushCanvasToSkin() {
            const renderer = runtime.renderer;
            if (!renderer || this.skinId === null) return;

            const stage = this._getStageMetrics();
            const rotationCenter = [stage.halfWidth, stage.halfHeight];

            if (typeof renderer.updateBitmapSkin === 'function') {
                renderer.updateBitmapSkin(this.skinId, this.canvas, 1, rotationCenter);
            } else if (
                renderer._allSkins &&
                renderer._allSkins[this.skinId] &&
                typeof renderer._allSkins[this.skinId].setBitmap === 'function'
            ) {
                renderer._allSkins[this.skinId].setBitmap(this.canvas, 1, rotationCenter);
            }

            if (runtime.requestRedraw) runtime.requestRedraw();
        }

        _stageToCanvasX(x) {
            return x + this._getStageMetrics().halfWidth;
        }

        _stageToCanvasY(y) {
            return this._getStageMetrics().halfHeight - y;
        }

        _getBar(name) {
            const key = String(name).trim();
            if (!key) return null;
            if (!this.bars.has(key)) this.bars.set(key, makeBarState());
            return this.bars.get(key);
        }

        _lookupSprite(spriteName) {
            const name = String(spriteName || '').trim();
            if (!name) return null;

            if (typeof runtime.getSpriteTargetByName === 'function') {
                const t = runtime.getSpriteTargetByName(name);
                if (t && !t.isStage && t.isOriginal !== false) return t;
            }

            for (const target of runtime.targets || []) {
                if (!target || target.isStage) continue;
                const tName = typeof target.getName === 'function'
                    ? target.getName()
                    : target.sprite && target.sprite.name;
                if (tName === name) return target;
            }

            return null;
        }

        _updateFollowPosition(bar) {
            if (!bar.followSprite) return;
            const target = this._lookupSprite(bar.followSprite);
            if (!target) return;
            bar.x = (Number(target.x) || 0) + bar.offsetX;
            bar.y = (Number(target.y) || 0) + bar.offsetY;
        }

        // Draws a filled rounded rectangle using pixel-grid row logic.
        // R = roundness (cap width in design pixels). rows = number of pixel rows.
        // pxSize = canvas pixels per design pixel.
        _drawFilledRoundedRect(cx, cy, cw, ch, rows, R, pxSize, color) {
            this.ctx.fillStyle = color;

            if (R <= 0 || rows <= 0) {
                if (cw > 0 && ch > 0) this.ctx.fillRect(cx, cy, cw, ch);
                return;
            }

            for (let i = 0; i < rows; i++) {
                const distFromEdge = Math.min(i, rows - 1 - i);
                const startCol = Math.max(0, R - 1 - distFromEdge);
                const rowX = cx + startCol * pxSize;
                const rowW = cw - 2 * startCol * pxSize;
                if (rowW <= 0) continue;
                this.ctx.fillRect(rowX, cy + i * pxSize, rowW, pxSize);
            }
        }

        _renderBar(bar) {
            const pct = bar.max > 0 ? Math.max(0, Math.min(1, bar.value / bar.max)) : 0;

            const isVertical = bar.direction === 'bottom-top' || bar.direction === 'top-bottom';
            // For right-left and top-bottom, fill grows from the "end" side.
            const fillFromRight = bar.direction === 'right-left' || bar.direction === 'top-bottom';

            const scale = Math.max(0, bar.scale);
            const outerW = bar.width * scale;
            const outerH = bar.height * scale;

            // For vertical bars, swap length/thickness axes for drawing.
            const drawW = isVertical ? outerH : outerW;
            const drawH = isVertical ? outerW : outerH;

            if (drawW <= 0 || drawH <= 0) return;

            const pxSize = drawH / NATIVE_H;
            const R = Math.max(0, Math.min(bar.roundness, Math.floor(NATIVE_H / 2)));
            const innerR = Math.max(0, R - BORDER_PX);
            const innerRows = NATIVE_H - 2 * BORDER_PX;

            const canvasX = this._stageToCanvasX(bar.x) - outerW / 2;
            const canvasY = this._stageToCanvasY(bar.y) - outerH / 2;

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, Math.min(1, bar.opacity / 100));

            if (isVertical) {
                // Rotate -90° around the bar center so "right" in draw space = "up" on screen.
                this.ctx.translate(canvasX + outerW / 2, canvasY + outerH / 2);
                this.ctx.rotate(-Math.PI / 2);
                this.ctx.translate(-drawW / 2, -drawH / 2);
            } else {
                this.ctx.translate(canvasX, canvasY);
            }

            // Layer 1: border (full outer shape)
            this._drawFilledRoundedRect(0, 0, drawW, drawH, NATIVE_H, R, pxSize, bar.borderColor);

            // Layer 2: track (inner background, inset by border)
            const innerX = BORDER_PX * pxSize;
            const innerY = BORDER_PX * pxSize;
            const innerW = drawW - 2 * BORDER_PX * pxSize;
            const innerH = drawH - 2 * BORDER_PX * pxSize;

            if (innerW > 0 && innerH > 0) {
                this._drawFilledRoundedRect(innerX, innerY, innerW, innerH, innerRows, innerR, pxSize, bar.bgColor);

                // Layer 3: fill (clipped portion of inner shape)
                if (pct > 0) {
                    const fillW = innerW * pct;
                    const clipX = fillFromRight ? innerX + innerW - fillW : innerX;

                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.rect(clipX, innerY, fillW, innerH);
                    this.ctx.clip();
                    this._drawFilledRoundedRect(innerX, innerY, innerW, innerH, innerRows, innerR, pxSize, bar.fillColor);
                    this.ctx.restore();
                }
            }

            this.ctx.restore();
        }

        _refresh() {
            if (!runtime.renderer) return;
            this._ensureCanvasSize();
            this._setupDrawable();

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            for (const bar of this.bars.values()) {
                if (!bar.visible) continue;
                this._updateFollowPosition(bar);
                this._renderBar(bar);
            }

            this._pushCanvasToSkin();
        }

        getInfo() {
            return {
                id: 'jayFactoryBars',
                name: 'Factory Bars',
                color1: '#cc4400',
                color2: '#aa3300',
                color3: '#882200',
                blocks: [
                    // --- value ---
                    {
                        opcode: 'setBarValue',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] value to [VALUE]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 }
                        }
                    },
                    {
                        opcode: 'changeBarValue',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'change bar [NAME] value by [AMOUNT]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            AMOUNT: { type: Scratch.ArgumentType.NUMBER, defaultValue: -10 }
                        }
                    },
                    {
                        opcode: 'setBarMax',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] max to [MAX]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            MAX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }
                        }
                    },
                    '---',
                    // --- position ---
                    {
                        opcode: 'setBarX',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] x to [X]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
                        }
                    },
                    {
                        opcode: 'setBarY',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] y to [Y]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 150 }
                        }
                    },
                    '---',
                    // --- size ---
                    {
                        opcode: 'setBarWidth',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] width to [WIDTH]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            WIDTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 200 }
                        }
                    },
                    {
                        opcode: 'setBarHeight',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] height to [HEIGHT]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            HEIGHT: { type: Scratch.ArgumentType.NUMBER, defaultValue: 40 }
                        }
                    },
                    {
                        opcode: 'setBarScale',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] scale to [SCALE]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            SCALE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 }
                        }
                    },
                    '---',
                    // --- style ---
                    {
                        opcode: 'setBarFillColor',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] fill color to [COLOR]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#00cc44' }
                        }
                    },
                    {
                        opcode: 'setBarBgColor',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] background color to [COLOR]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            COLOR: { type: Scratch.ArgumentType.COLOR, defaultValue: '#222222' }
                        }
                    },
                    {
                        opcode: 'setBarRoundness',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] roundness to [R]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            R: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 }
                        }
                    },
                    {
                        opcode: 'setBarOpacity',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] opacity to [OPACITY]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            OPACITY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 }
                        }
                    },
                    {
                        opcode: 'setBarDirection',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'set bar [NAME] direction to [DIR]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            DIR: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'directionMenu',
                                defaultValue: 'left-right'
                            }
                        }
                    },
                    '---',
                    // --- visibility ---
                    {
                        opcode: 'showBar',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'show bar [NAME]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    {
                        opcode: 'hideBar',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'hide bar [NAME]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    '---',
                    // --- follow ---
                    {
                        opcode: 'attachBar',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'attach bar [NAME] to sprite [SPRITE] offset x [OX] y [OY]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' },
                            SPRITE: { type: Scratch.ArgumentType.STRING, defaultValue: 'Player' },
                            OX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
                            OY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 30 }
                        }
                    },
                    {
                        opcode: 'detachBar',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'detach bar [NAME]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    '---',
                    // --- lifecycle ---
                    {
                        opcode: 'deleteBar',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'delete bar [NAME]',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    {
                        opcode: 'resetAllBars',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'reset all bars'
                    },
                    '---',
                    // --- reporters ---
                    {
                        opcode: 'getBarValue',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'bar [NAME] value',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    {
                        opcode: 'getBarPercent',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'bar [NAME] percent',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    },
                    {
                        opcode: 'barExists',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'bar [NAME] exists?',
                        arguments: {
                            NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'hp' }
                        }
                    }
                ],
                menus: {
                    directionMenu: {
                        acceptReporters: true,
                        items: DIRECTION_MENU
                    }
                }
            };
        }

        // Block handlers

        setBarValue(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.value = Scratch.Cast.toNumber(args.VALUE);
        }

        changeBarValue(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.value = bar.value + Scratch.Cast.toNumber(args.AMOUNT);
        }

        setBarMax(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.max = Math.max(0, Scratch.Cast.toNumber(args.MAX));
        }

        setBarX(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.x = Scratch.Cast.toNumber(args.X);
        }

        setBarY(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.y = Scratch.Cast.toNumber(args.Y);
        }

        setBarWidth(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.width = Math.max(1, Scratch.Cast.toNumber(args.WIDTH));
        }

        setBarHeight(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.height = Math.max(1, Scratch.Cast.toNumber(args.HEIGHT));
        }

        setBarScale(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.scale = Math.max(0, Scratch.Cast.toNumber(args.SCALE));
        }

        setBarFillColor(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.fillColor = Scratch.Cast.toString(args.COLOR);
        }

        setBarBgColor(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.bgColor = Scratch.Cast.toString(args.COLOR);
        }

        setBarRoundness(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.roundness = Math.max(0, Math.min(5, Math.round(Scratch.Cast.toNumber(args.R))));
        }

        setBarOpacity(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.opacity = Math.max(0, Math.min(100, Scratch.Cast.toNumber(args.OPACITY)));
        }

        setBarDirection(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            const dir = Scratch.Cast.toString(args.DIR);
            if (VALID_DIRECTIONS.has(dir)) bar.direction = dir;
        }

        showBar(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.visible = true;
        }

        hideBar(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.visible = false;
        }

        attachBar(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.followSprite = Scratch.Cast.toString(args.SPRITE);
            bar.offsetX = Scratch.Cast.toNumber(args.OX);
            bar.offsetY = Scratch.Cast.toNumber(args.OY);
        }

        detachBar(args) {
            const bar = this._getBar(args.NAME);
            if (!bar) return;
            bar.followSprite = null;
        }

        deleteBar(args) {
            this.bars.delete(String(args.NAME).trim());
        }

        resetAllBars() {
            this.bars.clear();
        }

        getBarValue(args) {
            const bar = this.bars.get(String(args.NAME).trim());
            return bar ? bar.value : 0;
        }

        getBarPercent(args) {
            const bar = this.bars.get(String(args.NAME).trim());
            if (!bar || bar.max <= 0) return 0;
            return Math.max(0, Math.min(100, (bar.value / bar.max) * 100));
        }

        barExists(args) {
            return this.bars.has(String(args.NAME).trim());
        }
    }

    Scratch.extensions.register(new FactoryBars());
})(Scratch);
