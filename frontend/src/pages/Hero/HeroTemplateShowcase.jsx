import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { heroPreviewPath } from '../../i18n/templatePreviews.js';
import { t as uiText } from '../../i18n/index.js';
import classes from './HeroTemplateShowcase.module.css';

/**
 * Illustrate finished CVs without asking visitors to choose a template twice.
 * These samples are not controls: onboarding owns selection and creation.
 * Loading and failures keep the A4 footprint; no editor or PDF tree is mounted.
 */
export default function HeroTemplateShowcase({ templates }) {
  useTranslation();
  const [imageStates, setImageStates] = useState({});
  const foreground = templates.find((template) => template.id === 'linden') || templates[0];

  if (!foreground) return <p>{uiText('public:heroTemplateShowcase.couldNotLoadPreviewsYouCanStill')}</p>;

  return (
    <div className={classes.showcase}>
      <div className={classes.stage} aria-hidden="true">
        {templates.map((template, index) => {
          const imageState = imageStates[template.id];
          return <div key={template.id} className={classes.card} data-position={template === foreground ? 'front' : index % 2 === 0 ? 'left' : 'right'}>
            <span className={classes.imageFallback}>
              <strong>{template.name}</strong>
              <span>{imageState === 'error' ? uiText('public:heroTemplateShowcase.previewUnavailable') : uiText('public:heroTemplateShowcase.loadingPreview')}</span>
            </span>
            {imageState !== 'error' && <img
              src={heroPreviewPath(template.id, 595)}
              srcSet={heroPreviewPath(template.id, 360) + ' 360w, ' + heroPreviewPath(template.id, 595) + ' 595w'}
              sizes="(max-width: 767px) 52vw, (max-width: 1024px) 308px, (max-width: 1440px) 24vw, 308px"
              alt=""
              width="595"
              height="842"
              loading={template === foreground ? 'eager' : 'lazy'}
              fetchPriority={template === foreground ? 'high' : 'low'}
              decoding="async"
              className={imageState === 'loaded' ? classes.loadedImage : classes.pendingImage}
              onLoad={() => setImageStates(current => ({ ...current, [template.id]: 'loaded' }))}
              onError={() => setImageStates(current => ({ ...current, [template.id]: 'error' }))}
            />}
          </div>;
        })}
      </div>
      {imageStates[foreground.id] === 'error' && <p className={classes.error} role="status">{uiText('public:heroTemplateShowcase.couldNotLoadPreviewsYouCanStill')}</p>}
    </div>
  );
}
