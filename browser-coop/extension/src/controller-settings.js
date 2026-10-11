import { AIM_SPEEDS, normalizeAimLevel } from './gamepad.js';

// Add the same setting to every map's existing Options menu, without replacing
// its HTML or touching the mouse/touch sensitivity or the room configuration.
export function mountControllerSettings({ level, onChange }) {
  const body = document.querySelector('#settings .settings-body');
  if (!body || document.getElementById('controller-sensitivity')) return null;

  const row = document.createElement('div');
  row.className = 'controller-setting';
  const label = document.createElement('label');
  label.htmlFor = 'controller-sensitivity';
  label.append('Sensibilité de la manette ');
  const output = document.createElement('output');
  output.id = 'controller-sensitivity-value';
  output.setAttribute('for', 'controller-sensitivity');
  output.style.marginInlineStart = '8px';
  output.style.flexShrink = '0';
  label.append(output);

  const input = document.createElement('input');
  input.id = 'controller-sensitivity';
  input.type = 'range';
  input.min = '1';
  input.max = String(AIM_SPEEDS.length);
  input.step = '1';
  input.style.minHeight = '44px';
  input.style.touchAction = 'pan-y';
  input.setAttribute('aria-describedby', 'controller-sensitivity-hint');
  const hint = document.createElement('p');
  hint.id = 'controller-sensitivity-hint';
  hint.textContent = 'Stick droit : de lent (1) à rapide (10).';
  hint.style.cssText = 'margin: -6px 0 16px; font-size: .75rem; text-transform: none; letter-spacing: normal;';
  row.append(label, input, hint);
  body.insertBefore(row, body.querySelector('label[for="volume"]'));
  // Keep the added control and the existing settings reachable on short screens.
  body.style.maxHeight = 'calc(100dvh - 100px - env(safe-area-inset-bottom))';
  body.style.overflowY = 'auto';

  const sync = value => {
    const display = normalizeAimLevel(value) + 1;
    input.value = String(display);
    output.value = `${display}/${AIM_SPEEDS.length}`;
    input.setAttribute('aria-valuetext', `${display} sur ${AIM_SPEEDS.length}`);
  };
  input.addEventListener('input', () => {
    const value = normalizeAimLevel(Number(input.value) - 1);
    sync(value);
    onChange(value);
  });
  sync(level);
  return { sync };
}
