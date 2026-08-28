import { MAX_FILE_BYTES, ACCEPTED_TYPES } from './constants.js';

const LOAD_TIMEOUT_MS = 15000;

/**
 * Validate and load an image File.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 * @throws on validation failure
 */
export function loadImageFile(file) {
  if (!file) throw new Error('未选择文件');

  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('仅支持 JPG / PNG / WebP 格式');
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），请压缩到 20MB 以下`);
  }

  // Use URL.createObjectURL — more reliable than FileReader.readAsDataURL
  // on iOS Safari and WeChat's built-in browser (X5 kernel).
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // crossOrigin helps avoid tainted-canvas issues for some browsers.
    img.crossOrigin = 'anonymous';

    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      settled = true;
    };

    // Some browsers (esp. older WeChat X5 on Android) fail to fire onload
    // — fall back to checking img.complete after a timeout.
    const timer = setTimeout(() => {
      if (settled) return;
      if (img.complete && img.naturalWidth > 0) {
        cleanup();
        resolve(img);
      } else {
        cleanup();
        reject(new Error('图片加载超时，请尝试其他图片或浏览器'));
      }
    }, LOAD_TIMEOUT_MS);

    img.onload = () => {
      if (settled) return;
      clearTimeout(timer);
      // Keep the object URL alive because Cropper.js reuses img.src.
      resolve(img);
    };
    img.onerror = () => {
      if (settled) return;
      clearTimeout(timer);
      cleanup();
      reject(new Error('图片解析失败，请尝试其他图片'));
    };
    img.src = url;
  });
}

/**
 * Wire the <input type="file"> to a callback.
 * @param {HTMLInputElement} input
 * @param {(img: HTMLImageElement) => void} onImage
 * @param {(err: Error) => void} onError
 */
export function bindUploader(input, onImage, onError) {
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      onImage(img);
    } catch (err) {
      onError(err);
    }
  });
}
