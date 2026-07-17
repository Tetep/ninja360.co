import type { ImageMetadata } from 'astro';

import timEmblem from './crew-tim-emblem.png';
import timBanner from './crew-tim-banner.png';
import gabeEmblem from './crew-gabe-emblem.png';
import gabeBanner from './crew-gabe-banner.png';
import pavanEmblem from './crew-pavan-emblem.png';
import pavanBanner from './crew-pavan-banner.png';
import erikEmblem from './crew-erik-emblem.png';
import erikBanner from './crew-erik-banner.png';
import gabePhoto from './crew-gabe-photo.jpg';
import pavanPhoto from './crew-pavan-photo.jpg';
import timPhoto from './crew-tim-photo.jpg';
import erikPhoto from './crew-erik-photo.jpg';

export const crewEmblems: Record<string, ImageMetadata> = {
  'crew-tim-emblem.png': timEmblem,
  'crew-gabe-emblem.png': gabeEmblem,
  'crew-pavan-emblem.png': pavanEmblem,
  'crew-erik-emblem.png': erikEmblem,
};

export const crewBanners: Record<string, ImageMetadata> = {
  'crew-tim-banner.png': timBanner,
  'crew-gabe-banner.png': gabeBanner,
  'crew-pavan-banner.png': pavanBanner,
  'crew-erik-banner.png': erikBanner,
};

export const crewPhotos: Record<string, ImageMetadata> = {
  'crew-tim-photo.jpg': timPhoto,
  'crew-gabe-photo.jpg': gabePhoto,
  'crew-pavan-photo.jpg': pavanPhoto,
  'crew-erik-photo.jpg': erikPhoto,
};
