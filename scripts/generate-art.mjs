import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../apps/extension/public/moodboard/', import.meta.url);
await mkdir(directory, { recursive: true });
// Original vector compositions. No fetched imagery or third-party artwork.
const art = {
  coffee: `<ellipse cx="170" cy="232" rx="112" ry="30" fill="ACCENT" opacity=".3"/><ellipse cx="161" cy="221" rx="87" ry="22" fill="PAPER" stroke="INK" stroke-width="2"/><path d="M104 126h110v67c0 49-110 49-110 0z" fill="PAPER" stroke="INK" stroke-width="3"/><path d="M214 145c55-13 61 64 0 48" fill="none" stroke="INK" stroke-width="11"/><ellipse cx="159" cy="128" rx="55" ry="16" fill="ACCENT" stroke="INK" stroke-width="3"/><path d="M147 120c20-19 31-2 13 10-19 5-34-3-13-10z" fill="PAPER"/><path d="M133 99c-22-23 25-28 0-52m44 49c-22-23 25-28 0-52" stroke="INK" opacity=".5" stroke-width="2" fill="none"/><path d="M43 255l245-10" stroke="INK" opacity=".4"/>`,
  books: `<path d="M58 234h235v18H58z" fill="INK"/><g stroke="INK" stroke-width="2"><path d="M65 100h42v133H65z" fill="ACCENT"/><path d="M111 68h43v165h-43z" fill="PAPER"/><path d="M158 112h35v121h-35z" fill="ACCENT"/><path d="M201 91l36-11 46 143-36 11z" fill="PAPER"/></g><path d="M74 116h23m-23 8h23m24-35h23m-23 7h23m26 29h17m-17 81h17" stroke="INK" stroke-width="2"/><circle cx="132" cy="153" r="9" fill="ACCENT"/><path d="M41 255h260" stroke="INK"/><path d="M278 61l-12 8 13 2-6 10m-40-40v14m-7-7h14" stroke="INK" fill="none"/>`,
  ceramics: `<ellipse cx="176" cy="243" rx="112" ry="20" fill="ACCENT" opacity=".35"/><path d="M120 72h72l-9 52c-4 16 50 34 45 71-6 64-149 63-151 0-1-34 57-57 51-71z" fill="ACCENT" stroke="INK" stroke-width="2"/><ellipse cx="156" cy="73" rx="36" ry="9" fill="INK"/><path d="M103 165c45 18 77 17 107-1m-113 29c46 14 86 13 122-2" stroke="PAPER" stroke-width="4" fill="none"/><path d="M248 146h38v90c-7 16-29 16-38 0z" fill="PAPER" stroke="INK" stroke-width="2"/><path d="M257 146l-13-67m24 67 19-82m-24 68c-35-16-38-31-18-28m24 6c33-20 37-39 18-30" stroke="INK" fill="none" stroke-width="2"/>`,
  code: `<rect x="45" y="65" width="250" height="168" rx="9" fill="PAPER" stroke="INK" stroke-width="3"/><path d="M45 94h250" stroke="INK" stroke-width="2"/><circle cx="60" cy="80" r="3" fill="ACCENT"/><circle cx="71" cy="80" r="3" fill="INK"/><circle cx="82" cy="80" r="3" fill="INK"/><path d="M103 131l-22 20 22 20m44-40 22 20-22 20m-14-47-19 55" stroke="INK" fill="none" stroke-width="4"/><path d="M192 130h74m-74 18h47m-47 18h60m-132 35h146" stroke="ACCENT" stroke-width="5"/><path d="M17 234h306l-14 14H32z" fill="INK"/><circle cx="273" cy="55" r="31" fill="ACCENT"/><path d="M258 54l10 10 20-22" stroke="PAPER" stroke-width="4" fill="none"/>`,
  design: `<rect x="61" y="49" width="208" height="209" rx="3" fill="PAPER" stroke="INK" stroke-width="2" transform="rotate(-7 170 150)"/><rect x="85" y="70" width="92" height="92" fill="ACCENT"/><circle cx="213" cy="117" r="36" fill="INK"/><path d="M90 221l52-58 50 58z" fill="INK"/><path d="M201 183h46m-46 12h46m-46 12h32" stroke="ACCENT" stroke-width="5"/><path d="M267 241l31-152 10 2-31 152-9 12z" fill="ACCENT" stroke="INK" stroke-width="2"/><path d="M36 82v23m-11-11h23" stroke="INK" stroke-width="2"/>`,
  outdoors: `<circle cx="256" cy="77" r="34" fill="ACCENT"/><path d="M0 232l93-118 75 78 52-60 120 102v66H0z" fill="INK" opacity=".75"/><path d="M0 266l90-70 83 51 68-36 99 51v38H0z" fill="ACCENT"/><path d="M155 300c83-54-33-49 29-88" stroke="PAPER" stroke-width="10" fill="none"/><path d="M44 222V101m0 2-33 62h66z" fill="INK" stroke="INK" stroke-width="3"/><path d="M77 147V77m0 4-23 45h46z" fill="INK"/><path d="M180 61c10-10 16-10 25 0m-25 0c-11-10-17-10-25 0" stroke="INK" fill="none" stroke-width="2"/>`,
  music: `<rect x="40" y="57" width="258" height="203" rx="9" fill="ACCENT" stroke="INK" stroke-width="2"/><circle cx="151" cy="160" r="82" fill="INK"/><circle cx="151" cy="160" r="67" fill="none" stroke="PAPER" opacity=".25"/><circle cx="151" cy="160" r="53" fill="none" stroke="PAPER" opacity=".25"/><circle cx="151" cy="160" r="31" fill="PAPER"/><circle cx="151" cy="160" r="5" fill="INK"/><path d="M261 86v68l-39 41" stroke="PAPER" stroke-width="9" fill="none"/><rect x="214" y="185" width="17" height="28" rx="3" transform="rotate(40 222 199)" fill="PAPER"/><circle cx="261" cy="86" r="10" fill="INK"/><circle cx="270" cy="232" r="8" fill="INK"/>`,
  community: `<circle cx="170" cy="145" r="78" fill="PAPER" stroke="INK" stroke-width="2"/><path d="M170 145L82 74m88 71 91-70m-91 70-91 83m91-83 93 88" stroke="INK" stroke-width="2"/><g fill="ACCENT" stroke="INK" stroke-width="2"><circle cx="79" cy="72" r="26"/><circle cx="263" cy="74" r="26"/><circle cx="78" cy="231" r="26"/><circle cx="264" cy="233" r="26"/></g><path d="M155 145c-26-26-40 17 15 41 55-24 40-67 15-41l-15 14z" fill="INK"/><path d="M153 45v-19m-9 10h19m0 232v17m-8-8h17" stroke="INK" stroke-width="2"/>`,
};
const colours = {
  paper: ['#eee7d8', '#344c40', '#b9c5a7', '#fffcf1'],
  ink: ['#d9e1df', '#2c4051', '#92a9b4', '#f6f3e9'],
  warm: ['#efddca', '#714735', '#c98865', '#fcf4e4'],
};
for (const [topic, drawing] of Object.entries(art)) {
  for (const [variant, [bg, ink, accent, paper]] of Object.entries(colours)) {
    const shapes = drawing
      .replaceAll('INK', ink)
      .replaceAll('ACCENT', accent)
      .replaceAll('PAPER', paper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="300" viewBox="0 0 340 300"><rect width="340" height="300" fill="${bg}"/><path d="M0 37h340M0 285h340" stroke="${ink}" opacity=".09"/>${shapes}</svg>`;
    await writeFile(new URL(`${topic}-${variant}.svg`, directory), svg);
  }
}
console.log('Generated 24 original moodboard illustrations.');
