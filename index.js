const GRAD3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1
]);

function createPermutation() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
    }
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
        perm[i] = p[i & 255];
        permMod12[i] = (perm[i] % 12) * 3;
    }
    return { perm, permMod12 };
}

function buildFieldShadeLUT(freq = 9) {
    const lut8 = new Uint8ClampedArray(1024 * 4);

    for (let i = 0; i < 1024; i++) {
        const v = (i / 1023) * 2 - 1;
        const norm = (v + 1) * 0.5;
        const elevated = v > 0 ? 1 : 0;

        let r = 10 + elevated * 6 + norm * 5;
        let g = 10 + elevated * 6 + norm * 5;
        let b = 12 + elevated * 8 + norm * 7;

        const wave = Math.sin(v * Math.PI * freq);
        const strata = Math.exp(-(wave * wave) * 24) * (0.042 + norm * 0.045);

        r += (237 - r) * strata;
        g += (237 - g) * strata;
        b += (239 - b) * strata;

        const idx = i << 2;
        lut8[idx] = r;
        lut8[idx + 1] = g;
        lut8[idx + 2] = b;
        lut8[idx + 3] = 255;
    }

    return new Uint32Array(lut8.buffer);
}

function createContinuumState(width, height, mode, scale, shadeFreq) {
    const { perm, permMod12 } = createPermutation();
    const imageData = new ImageData(width, height);
    const pixels32 = new Uint32Array(imageData.data.buffer);

    const trailCanvas = document.createElement("canvas");
    trailCanvas.width = width;
    trailCanvas.height = height;
    const trailCtx = trailCanvas.getContext("2d");

    const cell = 4;
    const cols = Math.floor(width / cell) + 1;
    const rows = Math.floor(height / cell) + 1;
    const maxCount = 32;

    const state = {
        width,
        height,
        mode,
        scale,
        cell,
        cols,
        rows,
        maxCount,
        count: 0,
        stepCount: 0,
        metricValue: 0,
        z: Math.random() * 100,
        perm,
        permMod12,
        field: new Float32Array(cols * rows),
        x: new Float32Array(maxCount),
        y: new Float32Array(maxCount),
        vx: new Float32Array(maxCount),
        vy: new Float32Array(maxCount),
        strength: new Float32Array(maxCount),
        radius: new Float32Array(maxCount),
        fieldLut32: buildFieldShadeLUT(shadeFreq),
        imageData,
        pixels32,
        trailCanvas,
        trailCtx,
        pointerX: width * 0.5,
        pointerY: height * 0.5,
        pointerActive: false
    };

    const margin = 105;
    for (let i = 0; i < 4; i++) {
        const px = margin + Math.random() * (width - margin * 2);
        const py = margin + Math.random() * (height - margin * 2);
        addVortexNode(state, px, py);
    }

    return state;
}

function addVortexNode(state, cx, cy) {
    if (state.count >= state.maxCount) return false;
    const idx = state.count++;
    const angle = Math.random() * Math.PI * 2;
    state.x[idx] = cx;
    state.y[idx] = cy;
    state.vx[idx] = Math.cos(angle) * 0.25;
    state.vy[idx] = Math.sin(angle) * 0.25;
    state.strength[idx] = (idx % 2 === 0 ? 1 : -1) * (0.65 + Math.random() * 0.45);
    state.radius[idx] = 95 + Math.random() * 45;
    return true;
}

function stepVortexNodes(state, sampleFn) {
    const { width, height, scale, count, x, y, vx, vy, perm, permMod12 } = state;
    const invScale = 1 / (scale * 3.0);
    const eps = 0.02;
    const margin = 48;

    state.z += 0.0026;

    for (let i = 0; i < count; i++) {
        const sx = x[i] * invScale;
        const sy = y[i] * invScale;

        const nY1 = sampleFn(sx, sy + eps, state.z, perm, permMod12);
        const nY0 = sampleFn(sx, sy - eps, state.z, perm, permMod12);
        const nX1 = sampleFn(sx + eps, sy, state.z, perm, permMod12);
        const nX0 = sampleFn(sx - eps, sy, state.z, perm, permMod12);

        let fx = ((nY1 - nY0) / (2 * eps)) * 0.08;
        let fy = -((nX1 - nX0) / (2 * eps)) * 0.08;

        for (let j = 0; j < count; j++) {
            if (i === j) continue;
            const dx = x[i] - x[j];
            const dy = y[i] - y[j];
            const dSq = dx * dx + dy * dy;
            if (dSq > 1e-4 && dSq < 9000) {
                const d = Math.sqrt(dSq);
                const push = (1 - d / 95) * 0.12;
                fx += (dx / d) * push;
                fy += (dy / d) * push;
            }
        }

        if (state.pointerActive) {
            const pdx = x[i] - state.pointerX;
            const pdy = y[i] - state.pointerY;
            const pDistSq = pdx * pdx + pdy * pdy;
            const pRad = 110;
            if (pDistSq > 1e-4 && pDistSq < pRad * pRad) {
                const pDist = Math.sqrt(pDistSq);
                const pForce = (1 - pDist / pRad) * 0.24;
                fx += (pdx / pDist) * pForce;
                fy += (pdy / pDist) * pForce;
            }
        }

        if (x[i] < margin) fx += (margin - x[i]) * 0.02;
        else if (x[i] > width - margin) fx -= (x[i] - (width - margin)) * 0.02;

        if (y[i] < margin) fy += (margin - y[i]) * 0.02;
        else if (y[i] > height - margin) fy -= (y[i] - (height - margin)) * 0.02;

        vx[i] = (vx[i] + fx) * 0.86;
        vy[i] = (vy[i] + fy) * 0.86;
        x[i] += vx[i];
        y[i] += vy[i];
    }
}

function traceIsoline(ctx, state, level, measureLength = false) {
    const { cols, rows, cell, field } = state;
    let totalLen = 0;

    for (let gy = 0; gy < rows - 1; gy++) {
        const y0 = gy * cell;
        const y1 = y0 + cell;
        const row0 = gy * cols;
        const row1 = row0 + cols;

        for (let gx = 0; gx < cols - 1; gx++) {
            const v0 = field[row0 + gx] - level;
            const v1 = field[row0 + gx + 1] - level;
            const v2 = field[row1 + gx + 1] - level;
            const v3 = field[row1 + gx] - level;

            const idx =
                (v0 > 0 ? 8 : 0) |
                (v1 > 0 ? 4 : 0) |
                (v2 > 0 ? 2 : 0) |
                (v3 > 0 ? 1 : 0);

            if (idx === 0 || idx === 15) continue;

            const x0 = gx * cell;
            const x1 = x0 + cell;

            const txTop = x0 + (v0 / (v0 - v1)) * cell;
            const tyRight = y0 + (v1 / (v1 - v2)) * cell;
            const txBottom = x0 + (v3 / (v3 - v2)) * cell;
            const tyLeft = y0 + (v0 / (v0 - v3)) * cell;

            switch (idx) {
                case 1:
                case 14:
                    ctx.moveTo(x0, tyLeft);
                    ctx.lineTo(txBottom, y1);
                    if (measureLength) totalLen += Math.hypot(txBottom - x0, y1 - tyLeft);
                    break;
                case 2:
                case 13:
                    ctx.moveTo(txBottom, y1);
                    ctx.lineTo(x1, tyRight);
                    if (measureLength) totalLen += Math.hypot(x1 - txBottom, tyRight - y1);
                    break;
                case 3:
                case 12:
                    ctx.moveTo(x0, tyLeft);
                    ctx.lineTo(x1, tyRight);
                    if (measureLength) totalLen += Math.hypot(x1 - x0, tyRight - tyLeft);
                    break;
                case 4:
                case 11:
                    ctx.moveTo(txTop, y0);
                    ctx.lineTo(x1, tyRight);
                    if (measureLength) totalLen += Math.hypot(x1 - txTop, tyRight - y0);
                    break;
                case 5:
                    ctx.moveTo(x0, tyLeft);
                    ctx.lineTo(txTop, y0);
                    ctx.moveTo(txBottom, y1);
                    ctx.lineTo(x1, tyRight);
                    if (measureLength) {
                        totalLen +=
                            Math.hypot(txTop - x0, y0 - tyLeft) +
                            Math.hypot(x1 - txBottom, tyRight - y1);
                    }
                    break;
                case 6:
                case 9:
                    ctx.moveTo(txTop, y0);
                    ctx.lineTo(txBottom, y1);
                    if (measureLength) totalLen += Math.hypot(txBottom - txTop, y1 - y0);
                    break;
                case 7:
                case 8:
                    ctx.moveTo(x0, tyLeft);
                    ctx.lineTo(txTop, y0);
                    if (measureLength) totalLen += Math.hypot(txTop - x0, y0 - tyLeft);
                    break;
                case 10:
                    ctx.moveTo(txTop, y0);
                    ctx.lineTo(x1, tyRight);
                    ctx.moveTo(x0, tyLeft);
                    ctx.lineTo(txBottom, y1);
                    if (measureLength) {
                        totalLen +=
                            Math.hypot(x1 - txTop, tyRight - y0) +
                            Math.hypot(txBottom - x0, y1 - tyLeft);
                    }
                    break;
            }
        }
    }

    return totalLen;
}

function stampFieldStrata(state) {
    const { trailCtx, width, height } = state;
    trailCtx.save();
    trailCtx.globalCompositeOperation = "destination-out";
    trailCtx.fillStyle = "rgba(0, 0, 0, 0.035)";
    trailCtx.fillRect(0, 0, width, height);

    trailCtx.globalCompositeOperation = "source-over";
    trailCtx.beginPath();
    traceIsoline(trailCtx, state, 0.0);
    trailCtx.strokeStyle = "rgba(237, 237, 239, 0.045)";
    trailCtx.lineWidth = 1;
    trailCtx.stroke();
    trailCtx.restore();
}

function rasterizeContinuumField(ctx, state) {
    const {
        width,
        cols,
        rows,
        cell,
        field,
        fieldLut32,
        imageData,
        pixels32,
        trailCanvas
    } = state;

    for (let gy = 0; gy < rows - 1; gy++) {
        const row0 = gy * cols;
        const row1 = row0 + cols;
        const pyStart = gy * cell;

        for (let gx = 0; gx < cols - 1; gx++) {
            const v00 = field[row0 + gx];
            const v10 = field[row0 + gx + 1];
            const v01 = field[row1 + gx];
            const v11 = field[row1 + gx + 1];

            const pxStart = gx * cell;
            const dTop = (v10 - v00) * 0.25;
            const dBot = (v11 - v01) * 0.25;

            let leftVal = v00;
            const dLeft = (v01 - v00) * 0.25;
            const stepSlope = (dBot - dTop) * 0.25;
            let dxVal = dTop;

            for (let sy = 0; sy < cell; sy++) {
                let val = leftVal;
                let pIdx = (pyStart + sy) * width + pxStart;

                for (let sx = 0; sx < cell; sx++) {
                    let lutIdx = ((val + 1) * 511.5) | 0;
                    if (lutIdx < 0) lutIdx = 0;
                    else if (lutIdx > 1023) lutIdx = 1023;
                    pixels32[pIdx + sx] = fieldLut32[lutIdx];
                    val += dxVal;
                }

                leftVal += dLeft;
                dxVal += stepSlope;
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
    ctx.drawImage(trailCanvas, 0, 0);
}

function renderIsolinesAndNodes(ctx, state) {
    const { count, x, y } = state;

    ctx.beginPath();
    traceIsoline(ctx, state, -0.3);
    traceIsoline(ctx, state, 0.3);
    ctx.strokeStyle = "rgba(237, 237, 239, 0.13)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    state.metricValue = traceIsoline(ctx, state, 0.0, true);
    ctx.strokeStyle = "rgba(237, 237, 239, 0.14)";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.strokeStyle = "#ededef";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        ctx.moveTo(x[i] + 3.4, y[i]);
        ctx.arc(x[i], y[i], 3.4, 0, Math.PI * 2);
    }
    ctx.strokeStyle = "rgba(237, 237, 239, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        ctx.moveTo(x[i] + 1.4, y[i]);
        ctx.arc(x[i], y[i], 1.4, 0, Math.PI * 2);
    }
    ctx.fillStyle = "#ededef";
    ctx.fill();
}

function createNoiseState(width, height, mode = "worley", scale = 56) {
    if (mode === "worley") return createWorley(width, height, scale);
    if (mode === "perlin") return createPerlin(width, height, scale);
    return createSimplex(width, height, scale);
}

function updateNoiseScale(state, scale) {
    if (state.mode === "worley") updateWorleyScale(state, scale);
    else if (state.mode === "perlin") updatePerlinScale(state, scale);
    else updateSimplexScale(state, scale);
}

function addInteractiveNode(state, x, y) {
    if (state.mode === "worley") return addWorleyCell(state, x, y, true);
    return addVortexNode(state, x, y);
}

function refreshStaticState(state) {
    if (state.mode === "worley") computeWorleyStats(state);
    else if (state.mode === "perlin") evaluatePerlinField(state);
    else evaluateSimplexField(state);
}

function stepNoise(state) {
    if (state.mode === "worley") return stepWorley(state);
    if (state.mode === "perlin") return stepPerlin(state);
    return stepSimplex(state);
}

function renderNoise(ctx, state) {
    if (state.mode === "worley") renderWorley(ctx, state);
    else if (state.mode === "perlin") renderPerlin(ctx, state);
    else renderSimplex(ctx, state);
}
