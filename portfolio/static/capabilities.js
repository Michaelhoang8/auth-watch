/* Domain extensions. Reports and request history stay in memory unless exported. */
(() => {
  const q = s => document.querySelector(s);
  const escape = v => String(v ?? 'N/A').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const controls = {
    headers: '<label>Baseline headers (optional)<textarea id="cap-baseline_text" placeholder="Paste a previous HTTP response header block"></textarea></label>',
    secrets: '<label>Block scan at severity<select id="cap-gate_severity"><option value="high">High only</option><option value="medium">Medium and high</option></select></label>',
    search: '<label>Ranking algorithm<select id="cap-algorithm"><option value="tfidf">TF-IDF cosine</option><option value="bm25">BM25 · length-normalized ranking</option></select></label><label>Maximum matches<input id="cap-top_k" type="number" min="1" max="20" value="10"></label>',
    evaluate: '<label>Cost of a false positive<input id="cap-false_positive_cost" type="number" min="0" max="1000000" step="any" value="1"></label><label>Cost of a false negative<input id="cap-false_negative_cost" type="number" min="0" max="1000000" step="any" value="5"></label>',
    reliability: '<label>Burn threshold for both windows<input id="cap-burn_threshold" type="number" min="0.01" max="10000" step="0.01" value="2"></label>'
  };
  window.installCapabilities = app => {
    const source=q('.source');
    if (!source || !q('#run')) return;
    q('#capability-options')?.remove();
    q('#saved-model')?.remove();
    if(app==='train') installSavedModel(source);
    if (!controls[app]) return;
    const fieldset=document.createElement('details'); fieldset.id='capability-options';
    fieldset.innerHTML='<summary>Analysis settings</summary><div class="disclosure-body">'+controls[app]+'</div>';
    fieldset.querySelectorAll('input[type=number]').forEach(input=>input.required=true);
    source.insertBefore(fieldset,q('#run'));
    fieldset.addEventListener('invalid',()=>{fieldset.open=true;},true);
    fieldset.addEventListener('input',()=>{window.invalidate();window.message('Settings changed. Run again to update the report.');});
    fieldset.addEventListener('change',()=>{window.invalidate();window.message('Settings changed. Run again to update the report.');});
  };
  window.capabilityInputs = () => Object.fromEntries([...document.querySelectorAll('[id^="cap-"]')].map(el=>[el.id.slice(4),el.type==='number'?Number(el.value):el.value]));
  const display = value => typeof value==='number' && Number.isFinite(value) ? new Intl.NumberFormat(undefined,{maximumSignificantDigits:7}).format(value) : value;
  const table = (headers,rows) => `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable report table"><table><thead><tr>${headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escape(display(v))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">No applicable records.</td></tr>`}</tbody></table></div>`;
  function download(name,text,type='application/json') {
    const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const pendingRequests=new Set();
  const cancelRequests=()=>pendingRequests.forEach(controller=>controller.abort());
  window.addEventListener('hashchange',cancelRequests);
  window.addEventListener('pagehide',cancelRequests);
  async function request(path,body) {
    const controller=new AbortController();pendingRequests.add(controller);
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},30000);
    try {
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Portfolio-Client':'browser'},body:JSON.stringify(body),signal:controller.signal});
      let data;
      try {data=await response.json();}
      catch(error) {if(error.name==='AbortError')throw error;throw Error('The server returned an unreadable response. Try again after checking the server.');}
      if(!data || typeof data!=='object' || Array.isArray(data))throw Error('The server returned an unreadable response. Try again after checking the server.');
      if(!response.ok)throw Error(typeof data.error==='string'?data.error:`Request failed (HTTP ${response.status}).`);
      return data;
    } catch(error) {
      if(error.name==='AbortError')throw Error(timedOut?'The request timed out after 30 seconds. Your inputs are preserved; try again.':'Request cancelled. Your inputs are preserved.');
      if(error instanceof TypeError)throw Error('Could not reach the local server. Check that it is running, then try again.');
      throw error;
    } finally {clearTimeout(timeout);pendingRequests.delete(controller);}
  }
  window.utilityRequest=request;
  function exportButton(parent,label,name,text,type) {
    const button=document.createElement('button');button.type='button';button.className='report-export';button.textContent=label;
    button.addEventListener('click',()=>download(name,text,type));parent.append(button);
  }
  window.renderCapabilities = result => {
    const section=document.createElement('details');section.className='extension-report';section.setAttribute('aria-label','Additional analysis');
    const extra=result.capabilities;
    if(extra) section.innerHTML=extra.tables.map(t=>`<h3>${escape(t.title)}</h3>${table(t.headers,t.rows)}`).join('')+extra.notes.map(n=>`<p class="hint">${escape(n)}</p>`).join('');
    for(const [key,label,name] of [['audit_csv','Export full row audit','cleaning-audit.csv'],['findings_csv','Export redacted findings','secret-findings.csv']]){
      if(result[key])exportButton(section,label,name,result[key],'text/csv;charset=utf-8');
    }
    if(result.rejected_rows>0 && result.rejected_csv)exportButton(section,'Export rejected records','rejected-records.csv',result.rejected_csv,'text/csv;charset=utf-8');
    if(result.prediction_audit_csv)exportButton(section,'Export prediction audit','prediction-audit.csv',result.prediction_audit_csv,'text/csv;charset=utf-8');
    if(result.hourly_metrics_csv)exportButton(section,'Export all hourly metrics','hourly-metrics.csv',result.hourly_metrics_csv,'text/csv;charset=utf-8');
    if(result.missing_ranges_csv)exportButton(section,'Export missing-hour ranges','missing-hour-ranges.csv',result.missing_ranges_csv,'text/csv;charset=utf-8');
    if(result.duplicate_locations_csv)exportButton(section,'Export duplicate locations','duplicate-locations.csv',result.duplicate_locations_csv,'text/csv;charset=utf-8');
    if(result.outlier_locations_csv)exportButton(section,'Export outlier locations','outlier-locations.csv',result.outlier_locations_csv,'text/csv;charset=utf-8');
    if(result.model) {
      exportButton(section,'Download model JSON','classifier-model.json',JSON.stringify(result.model,null,2));
      section.append(predictionPanel(result.model));
    }
    if(section.childNodes.length){section.insertAdjacentHTML('afterbegin','<summary>Detailed analysis & exports</summary>');q('#result').append(section);}
  };
  function predictionPanel(model) {
      const panel=document.createElement('div');panel.className='prediction-panel';
      panel.innerHTML='<h3>Use this model · batch prediction</h3><p class="hint">Paste CSV with the trained feature names. Training means and scales are reused; no refitting occurs. Extra columns are ignored. Up to 5,000 rows.</p><label>Unlabeled feature rows<textarea class="prediction-input" spellcheck="false"></textarea></label><label>Decision threshold<input class="prediction-threshold" required type="number" min="0" max="1" step="any" value="0.5"></label><button type="button" class="predict-button">Predict rows</button><p class="prediction-message" role="status"></p><div class="prediction-output"></div>';
      panel.querySelector('textarea').value=model.features.map(name=>'"'+name.replaceAll('"','""')+'"').join(',')+'\n'+model.means.join(',');
      panel.querySelector('input').value=model.threshold ?? .5;
      let prediction=null;
      const output=panel.querySelector('.prediction-output'),message=panel.querySelector('.prediction-message');
      panel.addEventListener('input',()=>{prediction=null;output.replaceChildren();message.textContent='Inputs changed. Predict again.';});
      panel.querySelector('button').addEventListener('click',async event=>{
        if (!panel.querySelector('input').reportValidity()) return;
        if (!panel.querySelector('textarea').value.trim()) {message.textContent='Paste feature rows before predicting.';panel.querySelector('textarea').focus();return;}
        const fields=[...panel.querySelectorAll('input,textarea,button')];fields.forEach(c=>c.disabled=true);message.textContent='Predicting…';panel.setAttribute('aria-busy','true');output.replaceChildren();
        try{prediction=await request('/api/extensions/predict',{model:model,csv:panel.querySelector('textarea').value,threshold:Number(panel.querySelector('input').value)});
          output.innerHTML=table(['Record','Score','Predicted class'],prediction.predictions.slice(0,50).map(p=>[p.record,p.score.toFixed(5),p.predicted]));
          exportButton(output,'Download all predictions','predictions.csv',prediction.csv,'text/csv;charset=utf-8');message.textContent=`Predicted ${prediction.rows} ${prediction.rows===1?'row':'rows'}. Showing ${Math.min(50,prediction.rows)}.`;
        }catch(error){prediction=null;output.replaceChildren();message.textContent=error.message;}finally{fields.forEach(c=>c.disabled=false);panel.setAttribute('aria-busy','false');}
      });
    return panel;
  }
  function installSavedModel(source) {
    const section=document.createElement('details');section.id='saved-model';
    section.innerHTML='<summary>Use a saved model</summary><div class="disclosure-body"><p class="hint">Load a Classifier Lab model or full training report. JSON only, up to 200 KB. Parameters are validated locally by this server.</p><label>Model JSON<input type="file" accept=".json,application/json"></label><p class="model-message" role="status"></p><div class="model-output"></div></div>';
    const input=section.querySelector('input'),message=section.querySelector('.model-message'),output=section.querySelector('.model-output');
    let revision=0;
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];input.value='';const current=++revision;output.replaceChildren();
      if(!file){message.textContent='';return;}
      if(file.size>200000){message.textContent='Choose a model JSON file under 200 KB.';return;}
      message.textContent='Validating model…';section.setAttribute('aria-busy','true');
      try {
        const text=await file.text();
        if(current!==revision || !section.isConnected)return;
        const result=await request('/api/extensions/model',{text});
        if(current!==revision || !section.isConnected)return;
        output.append(predictionPanel(result.model));
        exportButton(output,'Download validated model','classifier-model.json',JSON.stringify(result.model,null,2));
        message.textContent=`Model ready. ${result.model.features.length} ${result.model.features.length===1?'feature':'features'}. Training parameters are preserved.`;
      } catch(error) {if(current===revision && section.isConnected)message.textContent=error.message;}
      finally {if(current===revision)section.setAttribute('aria-busy','false');}
    });
    source.append(section);
  }
  function panel(sectionId,title,formHtml,handler) {
    const section=q(sectionId);if(!section)return;
    const container=document.createElement('details');container.className='panel extension-report';
    container.innerHTML=`<summary>${title}</summary><form class="extension-form">${formHtml}<button class="primary">Calculate plan</button></form><p class="extension-message" role="status"></p><div class="extension-output"></div>`;
    const form=container.querySelector('form'),message=container.querySelector('.extension-message'),output=container.querySelector('.extension-output');
    let revision=0;
    const invalidatePlan = text => {revision++;output.replaceChildren();message.textContent=text;};
    form.addEventListener('input',()=>invalidatePlan('Settings changed. Calculate again.'));
    if (sectionId==='#inventory') document.addEventListener('stock-updated',()=>invalidatePlan('Stock data changed. Calculate a fresh replenishment plan.'));
    form.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,Number(v)]));const inputs=[...form.elements];inputs.forEach(c=>c.disabled=true);message.textContent='Calculating…';const current=revision;const staging=document.createElement('div');output.replaceChildren();container.setAttribute('aria-busy','true');try{await handler(values,staging);if(current===revision){output.replaceChildren(...staging.childNodes);message.textContent='Plan ready. Export it below or change the inputs to compare another scenario.';}}catch(error){if(current===revision){output.replaceChildren();message.textContent=error.message;}}finally{inputs.forEach(c=>c.disabled=false);container.setAttribute('aria-busy','false');}});
    section.append(container);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.source input[type=number]').forEach(input=>input.required=true);
    q('#run')?.addEventListener('click',event=>{
      const inputs=[...document.querySelectorAll('.source input,.source select,.source textarea')].filter(input=>!input.closest('[hidden],#saved-model'));
      const invalid=inputs.find(input=>!input.checkValidity());
      if(invalid){event.stopImmediatePropagation();invalid.reportValidity();}
    },true);
    q('#clear')?.addEventListener('click',()=>{const baseline=q('#cap-baseline_text');if(baseline)baseline.value='';});
    panel('#inventory','Replenishment planner', '<label>Lead time · days<input name="lead_days" type="number" min="1" max="365" value="7" required></label><label>Safety coverage · days<input name="safety_days" type="number" min="0" max="365" value="7" required></label>',async(values,output)=>{
      const plan=await request('/api/extensions/stock-plan',values);const headers=['SKU','Product','Stock','30-day withdrawals','Daily demand','Days cover','Target','Order quantity'];const rows=plan.items.map(p=>[p.sku,p.name,p.stock,p.withdrawals_30d,p.daily_demand,p.days_cover??'N/A',p.target,p.order_quantity]);
      output.innerHTML=`<p class="hint">Demand window (UTC): ${escape(plan.demand_window.start)} to ${escape(plan.demand_window.end)}</p>`+table(headers,rows)+`<p class="hint">${escape(plan.note)}</p>`;exportButton(output,'Export replenishment plan','replenishment-plan.json',JSON.stringify(plan,null,2));exportButton(output,'Export replenishment CSV','replenishment-plan.csv',plan.csv,'text/csv;charset=utf-8');
    });
    panel('#experiments','Plan an experiment before collecting data','<label>Baseline rate · 0.10 = 10%<input name="baseline" type="number" min="0.0001" max="0.9999" step="0.0001" value="0.10" required></label><label>Absolute lift · 0.02 = 2 points<input name="absolute_lift" type="number" min="0.0001" max="0.99" step="0.0001" value="0.02" required></label><label>Statistical power<input name="power" type="number" min="0.5" max="0.99" step="0.01" value="0.8" required></label><label>Two-sided alpha<input name="alpha" type="number" min="0.001" max="0.2" step="0.001" value="0.05" required></label>',async(values,output)=>{
      const plan=await request('/api/extensions/experiment-plan',values);output.innerHTML=table(['Per variant','Total visitors','Detectable rate'],[[plan.per_variant,plan.total,(plan.detectable_rate*100).toFixed(2)+'%']])+`<p class="hint">${escape(plan.note)}</p>`;exportButton(output,'Export experiment design','experiment-plan.json',JSON.stringify(plan,null,2));
    });
  });
})();
