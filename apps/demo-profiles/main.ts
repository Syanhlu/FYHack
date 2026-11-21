const profiles = {
  alex: {
    name: 'Alex Morgan',
    initials: 'AM',
    role: 'Developer tools engineer & community mentor',
    bio: 'I am 29. I build accessible developer tools and maintain open-source projects. I like turning complicated systems into things that feel simple to use.',
    work: 'At fictional studio Common Tools, I work on an accessible command-line toolkit. I mentor first-time open-source contributors and care about clear documentation.',
    interests:
      'Outside work, I enjoy cycling, independent coffee shops, and reading books about design. Weekend rides and a good flat white are my favourite way to reset.',
    question:
      'Currently curious about how small design choices help new contributors feel welcome.',
  },
  jamie: {
    name: 'Jamie Ellis',
    initials: 'JE',
    role: 'Independent illustrator & maker',
    bio: 'I am 27. I am an illustrator working on playful editorial commissions and small-batch prints. I love colours that feel like an autumn afternoon.',
    work: 'My recent project explores hand-drawn maps for community bookshops. I also help run a beginner-friendly drawing group at a local arts centre.',
    interests:
      'My hobbies are pottery, second-hand bookshops, jazz records, and finding a good flat white. I take a pottery class each week and like learning new creative skills.',
    question: 'Always happy to talk about the little details in a good illustration.',
  },
  sparse: {
    name: 'Avery Lane',
    initials: 'AL',
    role: '',
    bio: 'Hello there.',
    work: '',
    interests: '',
    question: '',
  },
};
let active: keyof typeof profiles = 'alex';
function render() {
  const p = profiles[active];
  const main = document.createElement('main');
  main.id = 'profile';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = p.initials;
  main.append(avatar);
  const caption = document.createElement('small');
  caption.textContent = 'PEOPLE WHO MAKE THINGS';
  main.append(caption);
  const h1 = document.createElement('h1');
  h1.textContent = p.name;
  main.append(h1);
  const headline = document.createElement('p');
  headline.className = 'headline';
  headline.textContent = p.role;
  main.append(headline);
  for (const [title, text] of [
    ['About', p.bio],
    ['Work & projects', p.work],
    ['Away from the desk', p.interests],
    ['A current curiosity', p.question],
  ]) {
    if (!text) continue;
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const para = document.createElement('p');
    para.textContent = text;
    section.append(heading, para);
    main.append(section);
  }
  const hidden = document.createElement('p');
  hidden.hidden = true;
  hidden.textContent = 'Private hidden information should never be extracted.';
  main.append(hidden);
  document.querySelector('#profile')!.replaceWith(main);
  document.title = `${p.name} · Fieldnotes`;
}
document.querySelector('#switch')!.addEventListener('click', () => {
  active = active === 'alex' ? 'jamie' : 'alex';
  history.pushState({}, '', `/?profile=${active}`);
  render();
});
document.querySelector('#sparse')!.addEventListener('click', () => {
  active = 'sparse';
  render();
});
render();
