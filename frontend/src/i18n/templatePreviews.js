import { getUiLanguage } from './index.js';
/** Raster previews follow UI locale; saved document geometry is never changed. */
export function templatePreviewPath(id) {
  return `/template-mockups/${getUiLanguage() === 'en' ? 'en/' : ''}${id}.png`;
}
export function heroPreviewPath(id, width) {
  return `/hero-templates/${getUiLanguage() === 'en' ? 'en/' : ''}${id}-${width}.webp`;
}
