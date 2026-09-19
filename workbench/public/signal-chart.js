// Fixed quantitative coordinates. No camera transform, jitter, or inferred measurements.
const number = (n) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'not recorded';
export function signalMetrics(row, field, option) {
  const p = row.answers?.[field]?.probabilities?.[option];
  return `P(${option}) ${Number.isFinite(p) ? p.toFixed(3) : 'not recorded'} · ${number(row.usage?.inputTokens)} input tokens · ${number(row.latencyMs)} ms`;
}
export function signalScale(nodes, mode = 'linear') {
  const values = nodes.filter((n) => n.available).map((n) => n.y);
  const min = values.length ? Math.min(...values) : 0,
    max = values.length ? Math.max(...values) : 1;
  if (mode === 'log') {
    const low = min >= 10 ? 10 ** Math.floor(Math.log10(min)) : 0;
    const top = Math.max(low * 10 || 1, 10 ** Math.ceil(Math.log10(Math.max(1, max))));
    const ticks = [low];
    for (let n = low ? low * 10 : 1; n <= top; n *= 10) ticks.push(n);
    return {
      top,
      ticks,
      fraction: (v) => (Math.log1p(v) - Math.log1p(low)) / (Math.log1p(top) - Math.log1p(low)),
    };
  }
  const range = max - min || Math.max(1, max * 0.2),
    rough = range / 4,
    base = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((n) => n * base >= rough) ?? 10) * base;
  const low = Math.max(0, Math.floor((min - (max === min ? range / 2 : 0)) / step) * step);
  const top = Math.max(low + step, Math.ceil((max + (max === min ? range / 2 : 0)) / step) * step),
    ticks = [];
  for (let i = 0; i <= Math.round((top - low) / step); i++)
    ticks.push(Number((low + i * step).toPrecision(12)));
  return { top, ticks, fraction: (v) => (v - low) / (top - low) };
}
export function drawSignalPlot(
  ctx,
  { width, height, nodes, metric, scaleMode, option, filter, selected, hover },
) {
  ctx.fillStyle = '#081323';
  ctx.fillRect(0, 0, width, height);
  const left = 82,
    right = Math.max(left + 1, width - 35),
    top = 32,
    bottom = height - 74;
  const scale = signalScale(nodes, scaleMode),
    available = nodes.filter((n) => n.available);
  const x = (p) => left + p * (right - left),
    y = (value) => bottom - scale.fraction(value) * (bottom - top);
  ctx.lineWidth = 1;
  ctx.font = '13px system-ui, sans-serif';
  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.strokeStyle = '#35506c66';
    line(x(t), top, x(t), bottom);
    ctx.fillStyle = '#a7bed5';
    ctx.textAlign = 'center';
    ctx.fillText(t.toFixed(2), x(t), bottom + 24);
  }
  for (const t of scale.ticks) {
    ctx.strokeStyle = '#35506c66';
    line(left, y(t), right, y(t));
    ctx.fillStyle = '#a7bed5';
    ctx.textAlign = 'right';
    ctx.fillText(t >= 1000 ? `${t / 1000}k` : String(t), left - 12, y(t) + 4);
  }
  ctx.fillStyle = '#d6e5f4';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Model probability · ${option.replaceAll('_', ' ') || 'no distribution'}`,
    (left + right) / 2,
    height - 20,
  );
  ctx.save();
  ctx.translate(20, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(
    (metric === 'latencyMs' ? 'Latency · ms' : 'Input tokens') +
      (scaleMode === 'log' ? ' · log scale' : ''),
    0,
    0,
  );
  ctx.restore();
  if (!available.length) {
    ctx.fillStyle = '#d6e5f4';
    ctx.fillText('No comparable measurements', (left + right) / 2, (top + bottom) / 2);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#a7bed5';
    ctx.fillText(
      'Choose another judgment or recorded condition.',
      (left + right) / 2,
      (top + bottom) / 2 + 26,
    );
  }
  return available.map((node) => {
    const p = {
      x: x(node.x),
      y: y(node.y),
      node,
      dim: !!filter && filter !== node.status,
      depth: 0,
      s: 1,
      radius: 5,
    };
    const hot = node.key === selected || node.key === hover;
    ctx.globalAlpha = p.dim ? 0.09 : 0.85;
    ctx.fillStyle = node.color;
    ctx.strokeStyle = hot ? '#fff' : '#081323';
    ctx.lineWidth = hot ? 2 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, hot ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    return p;
  });
}
