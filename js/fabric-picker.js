/**
 * Fabric override picker overlay.
 * Renders Kona colors and lets the app select an override per colorIndex.
 */

let refs = null;
let currentColorIndex = null;
let currentFabricNumber = null;
let onSelectFabric = null;
let getFabrics = null;

export function initFabricPicker({ onSelect, getLibrary }) {
  refs = {
    overlay: document.getElementById('fabricPickerOverlay'),
    closeBtn: document.getElementById('fabricPickerCloseBtn'),
    title: document.getElementById('fabricPickerTitle'),
    search: document.getElementById('fabricPickerSearch'),
    grid: document.getElementById('fabricPickerGrid'),
  };

  onSelectFabric = onSelect;
  getFabrics = getLibrary;

  refs.overlay.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.action === 'close-fabric-picker') {
      closeFabricPicker();
      return;
    }

    const option = target.closest('.fabric-picker__option');
    if (!option) return;

    const number = option.dataset.fabricNumber;
    const fabric = (getFabrics() || []).find((entry) => String(entry.number) === number);
    if (!fabric || currentColorIndex == null) return;

    onSelectFabric(currentColorIndex, fabric);
    closeFabricPicker();
  });

  refs.closeBtn.addEventListener('click', closeFabricPicker);

  refs.search.addEventListener('input', () => {
    _renderOptions(_getFilteredFabrics());
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !_isHidden()) {
      closeFabricPicker();
    }
  });
}

export function openFabricPicker({ colorIndex, currentFabric, sourceLabel }) {
  if (!refs) return;

  currentColorIndex = colorIndex;
  currentFabricNumber = currentFabric?.number ? String(currentFabric.number) : null;
  refs.title.textContent = sourceLabel
    ? `Choose Kona color for ${sourceLabel}`
    : 'Choose Kona color';
  refs.search.value = '';

  _renderOptions(_getFilteredFabrics());

  refs.overlay.classList.remove('hidden');
  refs.overlay.setAttribute('aria-hidden', 'false');
  refs.search.focus();
}

export function closeFabricPicker() {
  if (!refs) return;
  refs.overlay.classList.add('hidden');
  refs.overlay.setAttribute('aria-hidden', 'true');
  currentColorIndex = null;
  currentFabricNumber = null;
}

function _isHidden() {
  return !refs || refs.overlay.classList.contains('hidden');
}

function _getFilteredFabrics() {
  const term = refs.search.value.trim().toLowerCase();
  const fabrics = getFabrics() || [];
  if (!term) return fabrics;

  return fabrics.filter((fabric) => {
    const name = String(fabric.name || '').toLowerCase();
    const number = String(fabric.number || '').toLowerCase();
    const hex = String(fabric.hex || '').toLowerCase();
    return name.includes(term) || number.includes(term) || hex.includes(term);
  });
}

function _renderOptions(fabrics) {
  refs.grid.replaceChildren();

  for (const fabric of fabrics) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fabric-picker__option';
    button.dataset.fabricNumber = String(fabric.number || '');
    button.setAttribute('role', 'option');

    if (currentFabricNumber && currentFabricNumber === String(fabric.number)) {
      button.classList.add('is-selected');
      button.setAttribute('aria-selected', 'true');
    } else {
      button.setAttribute('aria-selected', 'false');
    }

    const chip = document.createElement('span');
    chip.className = 'fabric-picker__chip';
    chip.style.backgroundColor = fabric.hex;

    const label = document.createElement('span');
    label.className = 'fabric-picker__label';
    label.textContent = `${fabric.name} (${fabric.number})`;

    button.append(chip, label);
    refs.grid.appendChild(button);
  }

  if (fabrics.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'fabric-picker__empty';
    empty.textContent = 'No Kona colors match that search.';
    refs.grid.appendChild(empty);
  }
}
