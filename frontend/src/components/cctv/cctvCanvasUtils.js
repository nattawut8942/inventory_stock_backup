// ยูทิลิตี้วาดบน canvas และสีสถานะของหน้า CCTV (แยกจาก CCTVPage)
export const STATUS_COLOR = { online: '#16a34a', offline: '#dc2626', unknown: '#9ca3af', removed: '#6b7280', retired: '#374151' };

// แปลง fov_direction string → canvas angle (องศา)
export const FOV_ANGLE_MAP = {
    N: 270, NNE: 292.5, NE: 315, ENE: 337.5,
    E: 0, ESE: 22.5, SE: 45, SSE: 67.5,
    S: 90, SSW: 112.5, SW: 135, WSW: 157.5,
    W: 180, WNW: 202.5, NW: 225, NNW: 247.5,
};

export function getFovAngle(fovDirection) {
    if (!fovDirection) return null;
    if (fovDirection.startsWith('CUSTOM_')) return parseFloat(fovDirection.replace('CUSTOM_', ''));
    return FOV_ANGLE_MAP[fovDirection] ?? null;
}

export function drawFovCone(ctx, px, py, angleDeg, spreadDeg = 60, len = 80,
    fill = 'rgba(59,130,246,0.18)', stroke = 'rgba(59,130,246,0.55)') {
    ctx.save();
    ctx.beginPath();
    if (spreadDeg >= 360) {
        ctx.arc(px, py, len, 0, Math.PI * 2);
    } else {
        const rad = angleDeg * (Math.PI / 180);
        const half = (spreadDeg / 2) * (Math.PI / 180);
        const x1 = px + Math.cos(rad - half) * len;
        const y1 = py + Math.sin(rad - half) * len;
        ctx.moveTo(px, py);
        ctx.lineTo(x1, y1);
        ctx.arc(px, py, len, rad - half, rad + half);
        ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
}

export function drawCornerFrame(ctx, cx, cy, halfSize, color, lineLen = 16, lineWidth = 3) {
    const x0 = cx - halfSize, x1 = cx + halfSize;
    const y0 = cy - halfSize, y1 = cy + halfSize;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    // มุมบนซ้าย
    ctx.beginPath(); ctx.moveTo(x0, y0 + lineLen); ctx.lineTo(x0, y0); ctx.lineTo(x0 + lineLen, y0); ctx.stroke();
    // มุมบนขวา
    ctx.beginPath(); ctx.moveTo(x1 - lineLen, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + lineLen); ctx.stroke();
    // มุมล่างขวา
    ctx.beginPath(); ctx.moveTo(x1, y1 - lineLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 - lineLen, y1); ctx.stroke();
    // มุมล่างซ้าย
    ctx.beginPath(); ctx.moveTo(x0 + lineLen, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - lineLen); ctx.stroke();
    ctx.restore();
}
