// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  instagramPostPath,
  visiblePostLink,
  instagramPostCaption,
} from '../apps/extension/src/extraction/images';

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

describe('Instagram post captions', () => {
  it('reads the owner caption without comments or UI text', () => {
    document.body.innerHTML = `<div role="dialog"><article><header><a href="/alex.morgan/">alex.morgan</a></header><ul>
      <li><h2><a href="/alex.morgan/">alex.morgan</a></h2><h1>I love <span>making pottery</span> on weekends.</h1></li>
      <li><a href="/someone.else/">Other</a><h2>I prefer hiking.</h2></li>
      <li><a href="/alex.morgan/">alex.morgan</a><span>Thanks for commenting!</span></li>
    </ul><button>Like</button></article></div>`;
    expect(instagramPostCaption(document, profile)).toBe('I love making pottery on weekends.');
  });
  it('rejects hidden, unrelated and unattributed captions', () => {
    document.body.innerHTML = `<div role="dialog"><article>
      <li hidden><a href="/alex.morgan/">alex</a><h1>Hidden caption</h1></li>
      <li><a href="https://other.example/alex.morgan/">alex</a><h1>Foreign author</h1></li>
      <li><a href="/someone.else/">Other</a><h1>Other caption</h1></li>
      <h1>Unattributed text</h1></article></div>`;
    expect(instagramPostCaption(document, profile)).toBe('');
  });
});
