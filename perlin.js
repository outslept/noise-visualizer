function fadePerlin(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpPerlin(a, b, t) {
    return a + t * (b - a);
}

function gradPerlin(gi, x, y, z) {
    return GRAD3[gi] * x + GRAD3[gi + 1] * y + GRAD3[gi + 2] * z;
}

function perlin3(x, y, z, perm, permMod12) {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const Z = Math.floor(z);

    x -= X;
    y -= Y;
    z -= Z;

    const ix = X & 255;
    const iy = Y & 255;
    const iz = Z & 255;

    const u = fadePerlin(x);
    const v = fadePerlin(y);
    const w = fadePerlin(z);

    const A = perm[ix] + iy;
    const AA = perm[A] + iz;
    const AB = perm[A + 1] + iz;
    const B = perm[ix + 1] + iy;
    const BA = perm[B] + iz;
    const BB = perm[B + 1] + iz;

    const gAA0 = permMod12[AA];
    const gBA0 = permMod12[BA];
    const gAB0 = permMod12[AB];
    const gBB0 = permMod12[BB];
    const gAA1 = permMod12[AA + 1];
    const gBA1 = permMod12[BA + 1];
    const gAB1 = permMod12[AB + 1];
    const gBB1 = permMod12[BB + 1];

    const x00 = lerpPerlin(gradPerlin(gAA0, x, y, z), gradPerlin(gBA0, x - 1, y, z), u);
    const x10 = lerpPerlin(gradPerlin(gAB0, x, y - 1, z), gradPerlin(gBB0, x - 1, y - 1, z), u);
    const x01 = lerpPerlin(gradPerlin(gAA1, x, y, z - 1), gradPerlin(gBA1, x - 1, y, z - 1), u);
    const x11 = lerpPerlin(gradPerlin(gAB1, x, y - 1, z - 1), gradPerlin(gBB1, x - 1, y - 1, z - 1), u);

    const y0 = lerpPerlin(x00, x10, v);
    const y1 = lerpPerlin(x01, x11, v);

    return lerpPerlin(y0, y1, w) * 1.15;
}

function fbmPerlin(x, y, z, perm, permMod12) {
    const v0 = perlin3(x, y, z, perm, permMod12);
    const v1 = perlin3(x * 2.02 + 11.3, y * 2.02 + 5.7, z * 1.35, perm, permMod12);
    const v2 = perlin3(x * 4.05 - 7.9, y * 4.05 + 17.1, z * 1.7, perm, permMod12);
    return (v0 + 0.48 * v1 + 0.22 * v2) / 1.55;
}

function createPerlin(width, height, scale = 56) {
    const state = createContinuumState(width, height, "perlin", scale, 8);
    evaluatePerlinField(state);
    stampFieldStrata(state);
    return state;
}

function updatePerlinScale(state, scale) {
    state.scale = scale;
    evaluatePerlinField(state);
}

function evaluatePerlinField(state) {
    const {
        cols,
        rows,
        cell,
        scale,
        z,
        field,
        perm,
        permMod12,
        count,
        x,
        y,
        strength,
        radius
    } = state;

    const invScale = 1 / (scale * 2.65);

    for (let gy = 0; gy < rows; gy++) {
        const py = gy * cell;
        const rowOffset = gy * cols;

        for (let gx = 0; gx < cols; gx++) {
            const px = gx * cell;
            let sx = px * invScale;
            let sy = py * invScale;

            for (let n = 0; n < count; n++) {
                const dx = px - x[n];
                const dy = py - y[n];
                const r = radius[n];
                const distSq = dx * dx + dy * dy;
                const rSq = r * r;

                if (distSq < rSq) {
                    const falloff = 1 - distSq / rSq;
                    const w = falloff * falloff * strength[n];
                    sx += (-dy * w * 0.65 + dx * w * 0.25) * invScale;
                    sy += (dx * w * 0.65 + dy * w * 0.25) * invScale;
                }
            }

            field[rowOffset + gx] = fbmPerlin(sx, sy, z, perm, permMod12);
        }
    }
}

function stepPerlin(state) {
    stepVortexNodes(state, perlin3);
    evaluatePerlinField(state);
    state.stepCount++;

    if (state.stepCount % 5 === 0) {
        stampFieldStrata(state);
    }

    return true;
}

function renderPerlin(ctx, state) {
    const { width, height, cols, rows, cell, scale, field } = state;

    rasterizeContinuumField(ctx, state);

    ctx.save();
    const step = Math.max(36, Math.round(scale * 0.9));
    ctx.beginPath();
    for (let py = step; py < height; py += step) {
        const gy = Math.min(rows - 2, (py / cell) | 0);
        for (let px = step; px < width; px += step) {
            const gx = Math.min(cols - 2, (px / cell) | 0);
            const idx = gy * cols + gx;
            const dx = field[idx + 1] - field[idx];
            const dy = field[idx + cols] - field[idx];
            const len = Math.hypot(dx, dy) || 1e-5;
            const ux = (dx / len) * 6.5;
            const uy = (dy / len) * 6.5;
            ctx.moveTo(px - ux * 0.5, py - uy * 0.5);
            ctx.lineTo(px + ux * 0.5, py + uy * 0.5);
        }
    }
    ctx.strokeStyle = "rgba(237, 237, 239, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    renderIsolinesAndNodes(ctx, state);
    ctx.restore();
}
