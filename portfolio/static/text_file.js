/* Local file decoding only; callers decide when to submit text for analysis. */
((root)=>{
  async function read(file,maxBytes,limitLabel){
    if(file.size>maxBytes)throw Error(`Choose a file no larger than ${limitLabel}.`);
    let buffer;
    try{buffer=await file.arrayBuffer();}
    catch{throw Error('The selected file could not be read. Choose it again and try again.');}
    if(buffer.byteLength>maxBytes)throw Error(`Choose a file no larger than ${limitLabel}.`);
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}
    catch{throw Error('This file is not valid UTF-8 text. Export it as UTF-8 and try again.');}
    if(!text.trim())throw Error('The selected file is empty. Choose a file with input data.');
    return text;
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={read};
  else root.localTextFile={read};
})(typeof window==='undefined'?globalThis:window);
