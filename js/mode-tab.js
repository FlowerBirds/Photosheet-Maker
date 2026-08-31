/**
 * Tab UI for switching between PHOTO and CARD modes.
 *
 * State preservation rules (per spec §4):
 *   - croppedCanvas / originalImage / rotation persist across mode switches.
 *   - Switching to CARD destroys the active cropper instance only.
 *   - Switching back to PHOTO restores the prior photo state:
 *       - croppedCanvas present → READY
 *       - originalImage present (no croppedCanvas) → CROPPING
 *       - otherwise → INITIAL
 */
export function createModeTab({
  photoBtn, cardBtn,
  photoSections,  // array of HTMLElement shown in PHOTO mode
  cardSections,   // array of HTMLElement shown in CARD mode
  onSwitch,       // (newMode) => void
}) {
  let mode = 'PHOTO';

  function show(target) {
    for (const el of photoSections) el.hidden = target !== 'PHOTO';
    for (const el of cardSections)  el.hidden = target !== 'CARD';
    photoBtn.classList.toggle('tab-active', target === 'PHOTO');
    cardBtn.classList.toggle('tab-active',  target === 'CARD');
  }

  photoBtn.addEventListener('click', () => {
    if (mode === 'PHOTO') return;
    mode = 'PHOTO';
    show(mode);
    onSwitch(mode);
  });
  cardBtn.addEventListener('click', () => {
    if (mode === 'CARD') return;
    mode = 'CARD';
    show(mode);
    onSwitch(mode);
  });

  return {
    getMode: () => mode,
    setMode: (m) => {
      if (m === mode) return;
      mode = m;
      show(mode);
      onSwitch(mode);
    },
  };
}