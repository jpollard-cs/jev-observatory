import DOMPurify from 'dompurify';
// Every legacy template sink passes here, including on browsers without Trusted Types.
// The UI needs forms and numeric inline styles, but never uploaded active markup.
export const safeHTML = (value) =>
  DOMPurify.sanitize(String(value), {
    USE_PROFILES: { html: true, svg: true },
    RETURN_TRUSTED_TYPE: true,
    FORBID_TAGS: [
      'foreignObject',
      'use',
      'image',
      'animate',
      'set',
      'animateTransform',
      'script',
      'iframe',
      'object',
      'embed',
      'img',
      'video',
      'audio',
      'source',
      'style',
      'link',
      'meta',
      'base',
    ],
    FORBID_ATTR: ['srcdoc'],
  });
