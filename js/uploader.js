import { MAX_FILE_BYTES, ACCEPTED_TYPES } from './constants.js';

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

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败，请尝试其他图片'));
      img.onload  = () => resolve(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
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
