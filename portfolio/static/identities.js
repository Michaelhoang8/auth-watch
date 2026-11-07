/* App identities are keyed to the same mode as the functional workspace. */
window.designIdentity = function (app) {
  const identities = {
    tickets: ['Issue Desk', 'DELIVERY / TEAM WORKSPACE', 'Keep the next release moving.'],
    inventory: ['Stockroom', 'OPERATIONS / GOODS IN MOTION', 'Every item. Every movement. Accounted for.'],
    experiments: ['Experiment Studio', 'RESEARCH / A–B TESTING', 'Turn a hypothesis into a measured decision.'],
    profile: ['Dataset Explorer', 'DATA INSPECTION / 01', 'Know what is in your data before you build on it.'],
    clean: ['Pipeline Studio', 'TRANSFORM / VALIDATE / EXPORT', 'A repeatable path from raw rows to usable data.'],
    sales: ['Revenue Lens', 'THE REVENUE REPORT', 'Follow the numbers. Find the story behind the sale.'],
    logs: ['Auth Watch', 'SECURITY OPERATIONS / EVENT TRIAGE', 'Find suspicious patterns in authentication events.'],
    headers: ['Header Review', 'WEB SECURITY / FIELD GUIDE', 'A practical checklist for your HTTP response headers.'],
    secrets: ['Secret Sentinel', 'PRIVATE CODE REVIEW', 'Catch exposed credentials before they travel further.'],
    train: ['Classifier Lab', 'NOTEBOOK 01 / SUPERVISED LEARNING', 'Train a baseline. Inspect the evidence. Repeat.'],
    search: ['Retrieval Studio', 'A SMALL LIBRARY, MADE SEARCHABLE', 'Ask a question. Discover the passages that matter.'],
    evaluate: ['Model Observatory', 'MEASUREMENT / CLASSIFICATION', 'Accuracy is only the beginning of the story.'],
    manifest: ['Manifest Review', 'INFRASTRUCTURE / CONFIGURATION REVIEW', 'Inspect the configuration before it becomes infrastructure.'],
    pipeline: ['Pipeline Planner', 'BUILD → TEST → SHIP', 'See how jobs connect and where time goes.'],
    reliability: ['Reliability Desk', 'SERVICE HEALTH / ERROR BUDGETS', 'Know how much room your service has left.'],
    rest: ['REST Studio', 'HTTP / REQUEST + RESPONSE', 'Work directly with the contract. Inspect every response.']
  };
  const identity = identities[app];
  if (!identity) return;
  document.body.dataset.app = app;
  window.installCapabilities?.(app);
  document.title = `${identity[0]}`;
  const intro = document.querySelector('.intro');
  if (intro) {
    intro.querySelector('h1').textContent = identity[0];
    intro.querySelector('.eyebrow').textContent = identity[1];
    intro.querySelector('p:not(.eyebrow)').textContent = identity[2];
    const brand = document.querySelector('header a:first-child');
    brand.textContent = 'Auth Watch';
  }
};
document.addEventListener('DOMContentLoaded', () => {
  window.designIdentity('logs');
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      const prediction = event.target.closest('.prediction-panel');
      const form = event.target.closest('.extension-form');
      if (prediction) { event.preventDefault(); const button=prediction.querySelector('.predict-button'); if (!button.disabled) button.click(); return; }
      if (form) { event.preventDefault(); if (!form.querySelector('button').disabled) form.requestSubmit(); return; }
      const run = document.querySelector('#run');
      if (run && !run.disabled) { event.preventDefault(); run.click(); }
    }
  });
  const run = document.querySelector('#run');
  if (run) run.title = 'Run · Ctrl+Enter or ⌘+Enter';
  document.addEventListener('click', event => {
    if (event.target.closest('[data-load-example]')) document.querySelector('#sample')?.click();
  });
  const skip = document.createElement('a');
  skip.className = 'skip-link'; skip.href = '#main-content'; skip.textContent = 'Skip to workspace';
  document.querySelector('main').id = 'main-content';
  document.querySelector('main').tabIndex = -1;
  skip.addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('main').focus();
  });
  document.body.prepend(skip);
  // Table previews can be wider than a phone or a keyboard user's viewport.
  const labelTables = () => document.querySelectorAll('.table-scroll,.table-wrap').forEach(region => {
    region.tabIndex=0;region.setAttribute('role','region');
    if(!region.hasAttribute('aria-label')){
      const heading=region.querySelector('h2,h3')||region.previousElementSibling;
      region.setAttribute('aria-label',heading?.matches('h2,h3')?heading.textContent.trim():'Scrollable data table');
    }
  });
  let tableFrame;
  new MutationObserver(records=>{
    if(!records.some(record=>record.addedNodes.length))return;
    cancelAnimationFrame(tableFrame);tableFrame=requestAnimationFrame(labelTables);
  }).observe(document.querySelector('main'),{childList:true,subtree:true});
  labelTables();

});

window.analysisEmpty = function (mode) {
  const copy = {
    profile: ['Understand every column', 'Inspect missing values, types, and distributions before using a dataset.'],
    clean: ['Build a cleaner dataset', 'Choose your cleaning steps, then compare input and output row counts.'],
    sales: ['See where revenue comes from', 'Map your date, category, and amount columns to build a revenue report.'],
    logs: ['Turn events into investigation leads', 'Load authentication events to inspect failure bursts and suspicious sequences.'],
    headers: ['Review your response policies', 'Paste an HTTP header block to see observed controls and practical next steps.'],
    secrets: ['Review text without exposing findings', 'Scan source text for credential patterns. Reports omit raw credential values.'],
    train: ['Train your first baseline', 'Load labeled numeric data to compare a classifier with a majority-class baseline.'],
    search: ['Find a passage worth reading', 'Add a document collection and a query to rank matching passages.'],
    evaluate: ['Look beyond accuracy', 'Supply labels and prediction scores to explore errors and threshold tradeoffs.'],
    manifest: ['Review before deployment', 'Load a Deployment manifest to inspect selected configuration policies.'],
    pipeline: ['Make the critical path visible', 'Define jobs and dependencies, then simulate their schedule with limited workers.'],
    reliability: ['Make your error budget concrete', 'Add hourly request counts and a reliability target to calculate budget consumption.']
  };
  const [title, description] = copy[mode];
  return `<div class="empty"><span aria-hidden="true">↗</span><h3>${title}</h3><p>${description}</p><button type="button" data-load-example>Load an example</button><small>Then run the analysis · Ctrl+Enter / ⌘+Enter</small></div>`;
};

window.analysisBusy = function (busy, success = false) {
  const results = document.querySelector('.results');
  results.setAttribute('aria-busy', String(busy));
  document.querySelector('#run').classList.toggle('is-working', busy);
  if (success) {
    const link = document.createElement('button');
    link.className = 'view-results'; link.textContent = 'View results ↓';
    link.addEventListener('click', () => {
      const heading = document.querySelector('#result-title');
      heading.tabIndex = -1;
      heading.scrollIntoView({behavior: 'auto', block: 'start'});
      heading.focus({preventScroll: true});
    });
    document.querySelector('#notice').append(' ', link);
  }
};


// Shared lifecycle for stateless analyses; never retries mutations automatically.
(() => {
  let active=null,cancelButton=null;
  document.addEventListener('DOMContentLoaded',()=>{
    const run=document.querySelector('#run');
    if(!run||document.body.dataset.app==='rest'||location.pathname==='/rest')return;
    cancelButton=document.createElement('button');cancelButton.id='cancel-analysis';
    cancelButton.type='button';cancelButton.textContent='Cancel analysis';cancelButton.hidden=true;
    cancelButton.addEventListener('click',()=>active?.controller.abort());run.after(cancelButton);
  });
  window.addEventListener('hashchange',()=>active?.controller.abort());
  window.addEventListener('pagehide',()=>active?.controller.abort());
  window.analysisRequest=async(path,body)=>{
    const request={controller:new AbortController(),timedOut:false};active=request;
    if(cancelButton){cancelButton.hidden=false;cancelButton.disabled=false;}
    const timeout=setTimeout(()=>{request.timedOut=true;request.controller.abort();},60000);
    try{
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Portfolio-Client':'browser'},body:JSON.stringify(body),signal:request.controller.signal});
      let data;try{data=await response.json();}catch(error){if(error.name==='AbortError')throw error;throw Error('The server returned an unreadable response. Check the server and try again.');}
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('The server returned an unreadable response. Check the server and try again.');
      if(!response.ok)throw Error(typeof data.error==='string'&&data.error?data.error:`Analysis failed (HTTP ${response.status}).`);
      return data;
    }catch(error){
      if(error.name==='AbortError')throw Error(request.timedOut?'The analysis timed out after 60 seconds. Your input is preserved; try a smaller dataset.':'Analysis cancelled. Your input is preserved.');
      if(error instanceof TypeError)throw Error('Could not reach the local server. Check that it is running, then try again.');
      throw error;
    }finally{
      clearTimeout(timeout);if(active===request){active=null;if(cancelButton){cancelButton.hidden=true;cancelButton.disabled=true;}}
    }
  };
})();
