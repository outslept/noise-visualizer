const F3 = 1 / 3;
const G3 = 1 / 6;

function simplex3(xin, yin, zin, perm, permMod12) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
        if (y0 >= z0) {
            i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
        } else if (x0 >= z0) {
            i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
        } else {
            i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
        }
    } else {
        if (y0 < z0) {
            i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
        } else if (x0 < z0) {
            i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
        } else {
            i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
        }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
        t0 *= t0;
        const gi0 = permMod12[ii + perm[jj + perm[kk]]];
        n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0 + GRAD3[gi0 + 2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
        t1 *= t1;
        const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
        n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1 + GRAD3[gi1 + 2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
        t2 *= t2;
        const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
        n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2 + GRAD3[gi2 + 2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
        t3 *= t3;
        const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
        n3 = t3 * t3 * (GRAD3[gi3] * x3 + GRAD3[gi3 + 1] * y3 + GRAD3[gi3 + 2] * z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
}

function fbmSimplex(x, y, z, perm, permMod12) {
    const v0 = simplex3(x, y, z, perm, permMod12);
    const v1 = simplex3(x * 2.04 - 13.7, y * 2.04 + 9.2, z * 1.4, perm, permMod12);
    const v2 = 1.0 - Math.abs(simplex3(x * 3.8 + 5.1, y * 3.8 - 14.3, z * 1.8, perm, permMod12));
    return v0 * 0.68 + v1 * 0.34 + (v2 * 2 - 1) * 0.22;
}

function createSimplex(width, height, scale = 56) {
    const state = createContinuumState(width, height, "simplex", scale, 11);
    evaluateSimplexField(state);
    stampFieldStrata(state);
    return state;
}

function updateSimplexScale(state, scale) {
    state.scale = scale;
    evaluateSimplexField(state);
}

function evaluateSimplexField(state) {
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

    const invScale = 1 / (scale * 3.1);

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

            field[rowOffset + gx] = fbmSimplex(sx, sy, z, perm, permMod12);
        }
    }
}

function stepSimplex(state) {
    stepVortexNodes(state, simplex3);
    evaluateSimplexField(state);
    state.stepCount++;

    if (state.stepCount % 5 === 0) {
        stampFieldStrata(state);
    }

    return true;
}

function renderSimplex(ctx, state) {
    rasterizeContinuumField(ctx, state);
    ctx.save();
    renderIsolinesAndNodes(ctx, state);
    ctx.restore();
}
