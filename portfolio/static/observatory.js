/* Optional interface feedback. Preferences stay local; audio is off by default. */
(() => {
  const voices={tickets:[330,'triangle'],inventory:[180,'sine'],experiments:[440,'triangle'],profile:[520,'sine'],clean:[660,'sine'],sales:[350,'triangle'],logs:[240,'sine'],headers:[580,'sine'],secrets:[200,'triangle'],train:[740,'sine'],search:[392,'sine'],evaluate:[880,'sine'],manifest:[294,'triangle'],pipeline:[494,'sine'],reliability:[262,'sine'],rest:[784,'triangle']};
  const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch{/* Preferences are optional. */}};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let motion=read('auth-watch-motion','on')==='on', sound=read('auth-watch-sound','off')==='on';
  let audio=null,lastTone=0,lastFeedback=0;
  function tone(kind='tap') {
    if(!sound||document.hidden)return;
    const now=performance.now();if(kind==='tap'){if(now-lastTone<120)return;lastTone=now;}else{if(now-lastFeedback<120)return;lastFeedback=now;}
    try{
      audio ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
      const voice=voices[document.body.dataset.app],base=voice?.[0]||392;
      const notes=kind==='complete'?[base,base*1.5]:kind==='error'?[base*.65,base*.5]:[base];
      notes.forEach((frequency,i)=>{
        const start=audio.currentTime+i*.09,osc=audio.createOscillator(),gain=audio.createGain();
        osc.type=voice?.[1]||'sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
        gain.gain.linearRampToValueAtTime(.025,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+.18);
        osc.connect(gain);gain.connect(audio.destination);osc.start(start);osc.stop(start+.2);
        osc.onended=()=>{osc.disconnect();gain.disconnect();};
      });
    }catch{/* Audio support is never required for an app action. */}
  }
  function preferences() {
    document.body.classList.toggle('still-life',!motion||reduced.matches);
    const soundButton=document.querySelector('#sound-switch'),motionButton=document.querySelector('#motion-switch');
    if(soundButton){soundButton.textContent=sound?'♪ Sound on':'♪ Sound off';soundButton.setAttribute('aria-pressed',String(sound));}
    if(motionButton){motionButton.textContent=reduced.matches?'Motion: system reduced':motion?'Motion on':'Motion off';motionButton.setAttribute('aria-pressed',String(motion&&!reduced.matches));motionButton.disabled=reduced.matches;}
  }
  // Content is always visible; observation only adds a one-time entrance effect.
  const observed=new WeakSet();
  const revealObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    for(const entry of entries){if(!entry.isIntersecting)continue;
      if(motion&&!reduced.matches&&!document.hidden)entry.target.classList.add('quiet-reveal');
      revealObserver.unobserve(entry.target);
    }
  },{threshold:.08}):null;
  function observePanels(){
    document.querySelectorAll('.source,.results,.page:not([hidden]) .panel,.page:not([hidden]) .column').forEach(panel=>{
      if(observed.has(panel))return;observed.add(panel);revealObserver?.observe(panel);
    });
  }
  function mount() {
    preferences();
    const hero=document.querySelector('.intro')||document.querySelector('.page:not([hidden]) .heading');
    if(hero){hero.classList.remove('quiet-arrival');void hero.offsetWidth;hero.classList.add('quiet-arrival');}
    observePanels();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const dock=document.createElement('details');dock.className='observatory-controls';dock.setAttribute('aria-label','Atmosphere preferences');
    dock.innerHTML='<summary>Display & sound</summary><div><button id="sound-switch" type="button" aria-pressed="false">♪ Sound off</button><button id="motion-switch" type="button" aria-pressed="true">Motion on</button></div>';
    const chrome=document.querySelector('main>header')||document.querySelector('body>header');
    (chrome||document.querySelector('main')).append(dock);
    document.querySelector('#sound-switch').addEventListener('click',()=>{sound=!sound;save('auth-watch-sound',sound?'on':'off');preferences();if(sound)tone('complete');});
    document.querySelector('#motion-switch').addEventListener('click',()=>{motion=!motion;save('auth-watch-motion',motion?'on':'off');preferences();});
    reduced.addEventListener('change',preferences);
    document.addEventListener('invalid',event=>{let panel=event.target.closest('details');while(panel){panel.open=true;panel=panel.parentElement?.closest('details');}},true);
    document.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&!button.disabled&&button.id!=='sound-switch')tone();});
    const observer=new MutationObserver(records=>{
      const notices=new Set();
      for(const record of records){const node=record.target.nodeType===1?record.target:record.target.parentElement;const notice=node?.closest('[role=status]');if(notice)notices.add(notice);}
      if(notices.size){preferences();observePanels();}
      for(const notice of notices){const text=notice.textContent.toLowerCase();if(notice.classList.contains('error')){tone('error');continue;}if(/complete|succeeded|saved|plan ready|predicted \d/.test(text)){tone('complete');const surface=document.querySelector('.results')||notice.closest('.panel');if(surface){surface.classList.remove('signal-complete');void surface.offsetWidth;surface.classList.add('signal-complete');}}}
    });
    observer.observe(document.querySelector('main'),{childList:true,subtree:true,characterData:true});
    document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('observatory-paused',document.hidden);if(document.hidden&&audio?.state==='running')audio.suspend().catch(()=>{});});
    window.addEventListener('hashchange',()=>requestAnimationFrame(mount));
    requestAnimationFrame(mount);
  });
})();
