export const isIframe = window.self !== window.top;

export function createPageUrl(pageName) {
  return '/' + pageName.replace(/ /g, '-');
}
