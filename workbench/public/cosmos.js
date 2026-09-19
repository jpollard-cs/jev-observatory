// Painter ported from the original Observatory CosmicBackdrop.jsx; source retained in provenance.
// Paint once. Only two compositor transforms move; no animation loop or live filters.
function paint(canvas, galaxy) {
  const size = galaxy ? 1024 : 1200;
  canvas.width = size;
  canvas.height = galaxy ? 1024 : 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let seed = galaxy ? 49127 : 7217;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(0.0001, random()))) * Math.cos(2 * Math.PI * random());
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const sc = sprite.getContext('2d');
  if (!sc) return;
  const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff8dd');
  g.addColorStop(0.07, '#ffe1a8');
  g.addColorStop(0.25, '#ad966a88');
  g.addColorStop(1, '#8c735900');
  sc.fillStyle = g;
  sc.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = 'screen';
  if (galaxy) {
    // Tidal arms: correlated arcs, diffuse warm dust, and pin-sharp blue young stars.
    for (let i = 0; i < 7800; i++) {
      const r = Math.pow(random(), 0.73) * 435,
        arm = (i % 2) * Math.PI;
      const theta = arm + r * 0.0105 + normal() * (0.13 + r / 1500);
      const x = 512 + Math.cos(theta) * r + normal() * 10,
        y = 512 + Math.sin(theta) * r * 0.77 + normal() * 12;
      const haze = i % 4 === 0,
        radius = haze ? 17 + random() * 34 : 0.7 + random() * 2.1;
      ctx.globalAlpha = haze ? 0.035 : 0.1 + random() * 0.48;
      if (haze) ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
      else {
        ctx.fillStyle = random() < 0.22 ? '#c2d8ff' : '#e8d2a9';
        ctx.beginPath();
        ctx.ellipse(x, y, radius, radius * 0.6, theta, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sprite, 360, 360, 304, 304);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(sprite, 420, 420, 184, 184);
  } else {
    for (let i = 0; i < 650; i++) {
      const x = random() * size,
        y = random() * 900,
        r = 0.4 + Math.pow(random(), 6) * 2.8;
      ctx.globalAlpha = 0.12 + random() * 0.6;
      ctx.fillStyle = ['#b7ccec', '#edcca3', '#98adc8'][i % 3];
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + random() * 0.4), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      if (r > 2) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(sprite, x - r * 5, y - r * 5, r * 10, r * 10);
      }
    }
  }
}

/** Mount once; decoration is not evaluation data. Compositor-only motion, paused when hidden. */
export function mountCosmos(host){
 host.innerHTML='<canvas class="cosmic-stars"></canvas><div class="cosmic-arm cosmic-arm-a"><canvas></canvas></div><div class="cosmic-arm cosmic-arm-b"><canvas></canvas></div><div class="cosmic-veil"></div>';
 const [field,arms,echo]=host.querySelectorAll('canvas');paint(field,false);paint(arms,true);echo.width=1024;echo.height=1024;echo.getContext('2d')?.drawImage(arms,0,0);
 const visibility=()=>host.dataset.hidden=String(document.hidden);visibility();document.addEventListener('visibilitychange',visibility);
 return ()=>document.removeEventListener('visibilitychange',visibility);
}
