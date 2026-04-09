/**
 * Manages the file upload area: click-to-browse and drag-and-drop.
 * Calls onImageLoaded(img, dataUrl) when a valid image is ready.
 */
export function initUpload(onImageLoaded) {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) _loadFile(file, onImageLoaded);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) _loadFile(file, onImageLoaded);
  });
}

function _loadFile(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => callback(img, e.target.result);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
