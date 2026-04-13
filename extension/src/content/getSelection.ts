/** Injected into the active tab to capture the user's selection. */
export function getSelection() {
  return {
    text: window.getSelection()?.toString() ?? '',
    title: document.title,
    url: location.href,
  };
}
