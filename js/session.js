/**
 * Session persistence: saves/restores app state to sessionStorage.
 * Stores: original image (as data URL), crop rect, slider settings.
 */

const STORAGE_KEY = 'applique-studio-session';

export function saveSession({ imageDataUrl, crop, numColors, detail }) {
  try {
    const data = JSON.stringify({ imageDataUrl, crop, numColors, detail });
    sessionStorage.setItem(STORAGE_KEY, data);
  } catch (e) {
    // sessionStorage can fail if image is too large (5-10MB limit)
    console.warn('Session save failed (image may be too large):', e.message);
  }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
