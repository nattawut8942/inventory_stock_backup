// ── shared CCTV icon drawing for canvas ───────────────────────────────────
// ใช้ได้ทั้งใน CCTVPage.jsx (map canvas) และ CCTVFormModal.jsx (preview)

export function drawCCTVIcon(ctx, px, py, r, iconType = 'bullet', bgColor, fgColor = 'white') {
    const bg = bgColor || '#4b5563';
    const s  = r / 24; // scale: r=16 → s=0.67, r=22 → s=0.92

    ctx.save();
    ctx.translate(px, py);

    switch (iconType) {
        case 'bullet': {
            // วงกลม bg
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            // body
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.roundRect(-r * 0.55, -r * 0.28, r * 1.1, r * 0.55, r * 0.25); ctx.fill();
            // head
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath(); ctx.roundRect(-r * 0.7, -r * 0.24, r * 0.5, r * 0.48, r * 0.15); ctx.fill();
            // lens
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(-r * 0.45, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.arc(-r * 0.45, 0, r * 0.13, 0, Math.PI * 2); ctx.fill();
            // highlight
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath(); ctx.arc(-r * 0.52, -r * 0.1, r * 0.07, 0, Math.PI * 2); ctx.fill();
            // bracket
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.roundRect(r * 0.5, -r * 0.55, r * 0.22, r * 0.45, r * 0.05); ctx.fill();
            break;
        }
        case 'dome': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            // dome arc
            ctx.fillStyle = fgColor;
            ctx.beginPath();
            ctx.arc(0, r * 0.1, r * 0.7, Math.PI, 0);
            ctx.closePath(); ctx.fill();
            // dark tint
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.arc(0, r * 0.1, r * 0.55, Math.PI, 0);
            ctx.closePath(); ctx.fill();
            // lens
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(-r * 0.07, -r * 0.12, r * 0.06, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'ptz': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            // pole
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath(); ctx.roundRect(-r * 0.12, -r * 0.95, r * 0.24, r * 0.45, r * 0.06); ctx.fill();
            // ball
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.55, 0, Math.PI * 2); ctx.fill();
            // lens housing
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.beginPath(); ctx.roundRect(-r * 0.5, -r * 0.07, r * 0.6, r * 0.44, r * 0.1); ctx.fill();
            // lens
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath(); ctx.arc(-r * 0.28, r * 0.07, r * 0.08, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'fisheye': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = fgColor; ctx.lineWidth = r * 0.05;
            ctx.globalAlpha = 0.45;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.65;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath(); ctx.arc(-r * 0.07, -r * 0.07, r * 0.06, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'box': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.roundRect(-r * 0.65, -r * 0.38, r * 1.1, r * 0.76, r * 0.1); ctx.fill();
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(-r * 0.18, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.arc(-r * 0.18, 0, r * 0.17, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.1, r * 0.07, 0, Math.PI * 2); ctx.fill();
            // lines
            ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = r * 0.05;
            ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.18); ctx.lineTo(r * 0.42, -r * 0.18); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.0);  ctx.lineTo(r * 0.42, r * 0.0);  ctx.stroke();
            // bracket
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath(); ctx.roundRect(-r * 0.2, -r * 0.9, r * 0.55, r * 0.28, r * 0.06); ctx.fill();
            break;
        }
        case 'pin': {
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.moveTo(0, r * 0.95);
            ctx.bezierCurveTo(-r * 0.6, r * 0.5, -r * 0.7, -r * 0.3, 0, -r * 0.8);
            ctx.bezierCurveTo(r * 0.7, -r * 0.3, r * 0.6, r * 0.5, 0, r * 0.95);
            ctx.fill();
            // ring
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = r * 0.1;
            ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.38, 0, Math.PI * 2); ctx.stroke();
            // lens
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.26, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.arc(-r * 0.08, -r * 0.16, r * 0.06, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'flat': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.roundRect(-r * 0.5, -r * 0.3, r * 0.75, r * 0.55, r * 0.1); ctx.fill();
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(-r * 0.12, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.arc(-r * 0.12, 0, r * 0.11, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.roundRect(r * 0.28, -r * 0.22, r * 0.14, r * 0.33, r * 0.04); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(r * 0.42, -r * 0.26); ctx.lineTo(r * 0.62, -r * 0.4);
            ctx.lineTo(r * 0.62, r * 0.4); ctx.lineTo(r * 0.42, r * 0.26);
            ctx.closePath(); ctx.fill();
            break;
        }
        case 'outline': {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = fgColor; ctx.lineWidth = r * 0.1; ctx.lineJoin = 'round';
            ctx.beginPath(); ctx.roundRect(-r * 0.5, -r * 0.28, r * 0.75, r * 0.56, r * 0.1); ctx.stroke();
            ctx.beginPath(); ctx.arc(-r * 0.12, 0, r * 0.22, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = fgColor;
            ctx.beginPath(); ctx.arc(-r * 0.12, 0, r * 0.09, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = fgColor; ctx.lineWidth = r * 0.08;
            ctx.beginPath(); ctx.roundRect(r * 0.28, -r * 0.2, r * 0.12, r * 0.4, r * 0.04); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(r * 0.4, -r * 0.24); ctx.lineTo(r * 0.6, -r * 0.38);
            ctx.lineTo(r * 0.6, r * 0.38); ctx.lineTo(r * 0.4, r * 0.24);
            ctx.closePath(); ctx.stroke();
            break;
        }
        default: {
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
            ctx.font = `${r}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('📹', 0, 0);
        }
    }

    ctx.restore();
}