const control = document.getElementById('motion'),
  lens = document.querySelector('.lens');
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
function update() {
  document.body.classList.toggle('motion-paused', paused || document.hidden);
  control.textContent = paused ? 'Resume motion' : 'Pause motion';
  control.setAttribute('aria-pressed', String(paused));
}
control.addEventListener('click', () => {
  paused = !paused;
  update();
});
document.addEventListener('visibilitychange', update);
new IntersectionObserver(([entry]) => {
  lens.classList.toggle('motion-paused', !entry.isIntersecting);
}).observe(lens);
update();
