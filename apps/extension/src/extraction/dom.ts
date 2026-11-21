import { cleanText } from '@profile-lens/contracts';

const excluded =
  'nav,aside,footer,[hidden],[aria-hidden="true"],script,style,noscript,form,input,textarea,[contenteditable="true"],[data-author="other"],[data-recommendations],.comments-comments-list,.comments-comment-item,.artdeco-card[aria-label="People you may know"],.pv-browsemap-section';
export function isVisible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.matches(excluded)) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0')
      return false;
  }
  return true;
}
export function visibleText(element: Element): string {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const parts: string[] = [];
  let count = 0;
  while (walker.nextNode() && count++ < 3000) {
    const parent = walker.currentNode.parentElement;
    // Icons carry their own labels (a "Verified" badge, "Link icon"): not something they wrote.
    if (parent && !parent.closest('svg') && isVisible(parent))
      parts.push(walker.currentNode.textContent ?? '');
  }
  return cleanText(parts.join(' '));
}
