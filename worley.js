function buildWorleyLUT(r, lut32) {
    const maxD1 = r * 1.45;
    const maxBorder = r * 0.85;
    const lut8 = new Uint8ClampedArray(256 * 256 * 4);

    for (let u = 0; u < 256; u++) {
        const uNorm = u / 255;
        const d1Px = uNorm * maxD1;
        const cellMask = Math.max(0, 1 - uNorm * 0.88);
        const coreGlow = Math.exp(-(d1Px * d1Px) / 26.0) * 0.11;
        const fade = uNorm > 0.86 ? Math.max(0.18, 1 - (uNorm - 0.86) / 0.14) : 1;

        for (let v = 0; v < 256; v++) {
            const vNorm = v / 255;
            const borderPx = vNorm * maxBorder;

            const bowl = (1 - vNorm) * 0.55 + (1 - uNorm) * 0.35;
            const baseR = 10 + 8 * cellMask * bowl;
            const baseG = 10 + 8 * cellMask * bowl;
            const baseB = 12 + 11 * cellMask * bowl;

            const wave = Math.sin(borderPx * 0.48 - d1Px * 0.14);
            const strata = Math.exp(-(wave * wave) * 18.0) * 0.048 * (1 - uNorm * 0.55);

            const ridgeGlow = Math.exp(-(borderPx * borderPx) / 18.0) * 0.15;
            const ridgeCore = Math.exp(-(borderPx * borderPx) / 1.55) * 0.92;

            const mix = Math.min(1, (ridgeCore + ridgeGlow) * fade + strata + coreGlow);
            const idx = ((u << 8) | v) << 2;

            lut8[idx] = baseR + (237 - baseR) * mix;
            lut8[idx + 1] = baseG + (237 - baseG) * mix;
            lut8[idx + 2] = baseB + (239 - baseB) * mix;
            lut8[idx + 3] = 255;
        }
    }

    lut32.set(new Uint32Array(lut8.buffer));
}

function createWorley(width, height, scale = 56) {
    const maxCount = 112;
    const imageData = new ImageData(width, height);
    const pixels32 = new Uint32Array(imageData.data.buffer);

    const state = {
        width,
        height,
        mode: "worley",
        scale,
        maxCount,
        count: 0,
        stepCount: 0,
        metricValue: 0,
        x: new Float32Array(maxCount),
        y: new Float32Array(maxCount),
        vx: new Float32Array(maxCount),
        vy: new Float32Array(maxCount),
        phase: new Float32Array(maxCount),
        candX: new Float32Array(maxCount),
        candY: new Float32Array(maxCount),
        worleyLut32: new Uint32Array(256 * 256),
        imageData,
        pixels32,
        pointerX: width * 0.5,
        pointerY: height * 0.5,
        pointerActive: false
    };

    buildWorleyLUT(scale, state.worleyLut32);

    const initialCells = Math.max(18, Math.min(64, Math.round((width * height) / (scale * scale * 3.8))));
    const margin = 48;

    for (let i = 0; i < initialCells; i++) {
        const px = margin + Math.random() * (width - margin * 2);
        const py = margin + Math.random() * (height - margin * 2);
        addWorleyCell(state, px, py, false);
    }

    computeWorleyStats(state);
    return state;
}

function updateWorleyScale(state, scale) {
    state.scale = scale;
    buildWorleyLUT(scale, state.worleyLut32);
}

function addWorleyCell(state, cx, cy, impulse = true) {
    if (state.count >= state.maxCount) return false;

    const idx = state.count++;
    const angle = Math.random() * Math.PI * 2;
    state.x[idx] = cx;
    state.y[idx] = cy;
    state.vx[idx] = Math.cos(angle) * 0.35;
    state.vy[idx] = Math.sin(angle) * 0.35;
    state.phase[idx] = Math.random() * Math.PI * 2;

    if (impulse) {
        const pushRadius = state.scale * 1.4;
        const pushSq = pushRadius * pushRadius;
        for (let i = 0; i < idx; i++) {
            const dx = state.x[i] - cx;
            const dy = state.y[i] - cy;
            const dSq = dx * dx + dy * dy;
            if (dSq > 1e-4 && dSq < pushSq) {
                const d = Math.sqrt(dSq);
                const kick = (1 - d / pushRadius) * 1.2;
                state.vx[i] += (dx / d) * kick;
                state.vy[i] += (dy / d) * kick;
            }
        }
    }

    return true;
}

function computeWorleyStats(state) {
    const { x, y, count } = state;
    if (count < 2) {
        state.metricValue = 0;
        return;
    }

    let sumNearest = 0;
    for (let i = 0; i < count; i++) {
        let minSq = Infinity;
        const xi = x[i];
        const yi = y[i];
        for (let j = 0; j < count; j++) {
            if (i === j) continue;
            const dx = xi - x[j];
            const dy = yi - y[j];
            const dSq = dx * dx + dy * dy;
            if (dSq < minSq) minSq = dSq;
        }
        sumNearest += Math.sqrt(minSq);
    }

    state.metricValue = sumNearest / count;
}

function stepWorley(state) {
    const { width, height, scale, x, y, vx, vy, phase, count } = state;
    if (count === 0) return false;

    const repelRadius = scale * 1.18;
    const repelSq = repelRadius * repelRadius;
    const margin = 36;
    const maxSpeed = 1.35;
    const t = state.stepCount * 0.014;

    let sumNearest = 0;

    for (let i = 0; i < count; i++) {
        const xi = x[i];
        const yi = y[i];
        const ph = phase[i];

        let fx = Math.cos(t + ph + yi * 0.007) * 0.045;
        let fy = Math.sin(t * 0.9 + ph + xi * 0.007) * 0.045;
        let minSq = Infinity;

        for (let j = 0; j < count; j++) {
            if (i === j) continue;
            const dx = xi - x[j];
            const dy = yi - y[j];
            const distSq = dx * dx + dy * dy;

            if (distSq < minSq) minSq = distSq;

            if (distSq > 1e-4 && distSq < repelSq) {
                const dist = Math.sqrt(distSq);
                const norm = 1 - dist / repelRadius;
                const force = norm * norm * 0.42;
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
            }
        }

        if (minSq < Infinity) {
            sumNearest += Math.sqrt(minSq);
        }

        if (state.pointerActive) {
            const pdx = xi - state.pointerX;
            const pdy = yi - state.pointerY;
            const pDistSq = pdx * pdx + pdy * pdy;
            const pRad = scale * 1.35;
            if (pDistSq > 1e-4 && pDistSq < pRad * pRad) {
                const pDist = Math.sqrt(pDistSq);
                const pForce = (1 - pDist / pRad) * 0.32;
                fx += (pdx / pDist) * pForce;
                fy += (pdy / pDist) * pForce;
            }
        }

        if (xi < margin) fx += (margin - xi) * 0.04;
        else if (xi > width - margin) fx -= (xi - (width - margin)) * 0.04;

        if (yi < margin) fy += (margin - yi) * 0.04;
        else if (yi > height - margin) fy -= (yi - (height - margin)) * 0.04;

        const nvx = (vx[i] + fx) * 0.88;
        const nvy = (vy[i] + fy) * 0.88;
        const spd = Math.hypot(nvx, nvy);

        if (spd > maxSpeed) {
            vx[i] = (nvx / spd) * maxSpeed;
            vy[i] = (nvy / spd) * maxSpeed;
        } else {
            vx[i] = nvx;
            vy[i] = nvy;
        }
    }

    for (let i = 0; i < count; i++) {
        x[i] += vx[i];
        y[i] += vy[i];
    }

    state.metricValue = count > 1 ? sumNearest / count : 0;
    state.stepCount++;
    return true;
}

function renderWorley(ctx, state) {
    const {
        width,
        height,
        scale,
        count,
        x,
        y,
        candX,
        candY,
        worleyLut32,
        imageData,
        pixels32
    } = state;

    if (count < 2) {
        ctx.fillStyle = "#0a0a0c";
        ctx.fillRect(0, 0, width, height);
        return;
    }

    const tileSize = 16;
    const invMaxD1 = 255 / (scale * 1.45);
    const invMaxBorder = 255 / (scale * 0.85);

    for (let ty = 0; ty < height; ty += tileSize) {
        const yEnd = Math.min(height, ty + tileSize);
        const cy = (ty + yEnd - 1) * 0.5;

        for (let tx = 0; tx < width; tx += tileSize) {
            const xEnd = Math.min(width, tx + tileSize);
            const cx = (tx + xEnd - 1) * 0.5;
            const tileRad = Math.hypot(xEnd - 1 - cx, yEnd - 1 - cy);

            let c1 = Infinity;
            let c2 = Infinity;

            for (let i = 0; i < count; i++) {
                const d = Math.hypot(x[i] - cx, y[i] - cy);
                if (d < c1) {
                    c2 = c1;
                    c1 = d;
                } else if (d < c2) {
                    c2 = d;
                }
            }

            const thresholdSq = (c2 + tileRad * 2 + 0.5) * (c2 + tileRad * 2 + 0.5);
            let candCount = 0;

            for (let i = 0; i < count; i++) {
                const dx = x[i] - cx;
                const dy = y[i] - cy;
                if (dx * dx + dy * dy <= thresholdSq) {
                    candX[candCount] = x[i];
                    candY[candCount] = y[i];
                    candCount++;
                }
            }

            for (let py = ty; py < yEnd; py++) {
                const rowOffset = py * width;
                for (let px = tx; px < xEnd; px++) {
                    let d1Sq = Infinity;
                    let d2Sq = Infinity;

                    for (let k = 0; k < candCount; k++) {
                        const dx = px - candX[k];
                        const dy = py - candY[k];
                        const dSq = dx * dx + dy * dy;

                        if (dSq < d1Sq) {
                            d2Sq = d1Sq;
                            d1Sq = dSq;
                        } else if (dSq < d2Sq) {
                            d2Sq = dSq;
                        }
                    }

                    const d1 = Math.sqrt(d1Sq);
                    const d2 = Math.sqrt(d2Sq);

                    let u = (d1 * invMaxD1) | 0;
                    let v = ((d2 - d1) * invMaxBorder) | 0;
                    if (u > 255) u = 255;
                    if (v > 255) v = 255;

                    pixels32[rowOffset + px] = worleyLut32[(u << 8) | v];
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);

    ctx.save();
    const linkDist = scale * 1.45;
    const linkDistSq = linkDist * linkDist;

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const xi = x[i];
        const yi = y[i];
        for (let j = i + 1; j < count; j++) {
            const dx = xi - x[j];
            const dy = yi - y[j];
            if (dx * dx + dy * dy < linkDistSq) {
                ctx.moveTo(xi, yi);
                ctx.lineTo(x[j], y[j]);
            }
        }
    }
    ctx.strokeStyle = "rgba(237, 237, 239, 0.05)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        ctx.moveTo(x[i] + 3.6, y[i]);
        ctx.arc(x[i], y[i], 3.6, 0, Math.PI * 2);
    }
    ctx.strokeStyle = "rgba(237, 237, 239, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        ctx.moveTo(x[i] + 1.5, y[i]);
        ctx.arc(x[i], y[i], 1.5, 0, Math.PI * 2);
    }
    ctx.fillStyle = "#ededef";
    ctx.fill();
    ctx.restore();
}
