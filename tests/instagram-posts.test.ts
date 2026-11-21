// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { instagramPostPath, visiblePostLink } from '../apps/extension/src/extraction/images';

const profile = 'https://www.instagram.com/alex.morgan/';
describe('Instagram post discovery', () => {
  it.each(['/p/Ab_c-12/', '/alex.morgan/p/Ab_c-12/', '/Alex.Morgan/p/Ab_c-12/?img_index=2'])(
    'accepts profile post route %s',
    (path) => {
      expect(instagramPostPath(path, profile)).toBe('/p/Ab_c-12');
    },
  );
  it.each([
    '/someone.else/p/Ab_c-12/',
    '/reel/Ab_c-12/',
    '/stories/alex/123/',
    '/p/code/extra',
    'https://evil.example/p/Ab_c-12/',
  ])('rejects unrelated route %s', (path) => {
    expect(instagramPostPath(path, profile)).toBeNull();
  });
  it('recognises a visible thumbnail inside a boxless link', () => {
    document.body.innerHTML =
      '<main><a style="display:contents" href="https://www.instagram.com/alex.morgan/p/abc/"><img src="photo.jpg" /></a></main>';
    const link = document.querySelector('a')!;
    link.querySelector('img')!.getBoundingClientRect = () => ({
      x: 10,
      y: 10,
      left: 10,
      top: 10,
      right: 210,
      bottom: 210,
      width: 200,
      height: 200,
      toJSON() {},
    });
    expect(visiblePostLink(link, profile)).toBe(true);
    link.closest('main')!.setAttribute('hidden', '');
    expect(visiblePostLink(link, profile)).toBe(false);
  });
});
