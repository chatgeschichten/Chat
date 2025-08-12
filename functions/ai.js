// functions/ai.js — CommonJS • kurze, persona-typische Freechat-Antworten (+optionale Memory-Extraktion)
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const PRIMARY_MODEL = 'gpt-4o-mini';
const FALLBACK_MODEL = 'gpt-4o';

function systemPromptForPersona(persona){
  const name = persona?.name || 'Chatpartner';
  const tag  = persona?.tag  || '';
  const desc = persona?.desc || 'Freundlicher, natürlicher Chatstil. Kurz, klar, jugendfreundlich.';
  return `Du bist ${name}${tag?` (${tag})`:''}.
Charakterbeschreibung: ${desc}

Schreibe wie in WhatsApp: natürlich, ohne Sternchen/Regieanweisungen.
Antworte KURZ: maximal 1–2 Sätze, höchstens ~160 Zeichen.
Dein Tonfall, Wortwahl und Emoji-Gebrauch soll klar zu deiner Rolle passen.
Jugendsicher, respektvoll.`;
}

function buildMessages({ persona, history, userText, start }){
  const msgs = [ { role:'system', content: systemPromptForPersona(persona) } ];
  if (Array.isArray(history)) msgs.push(...history.slice(-20));
  if (start) msgs.push({ role:'user', content:'Starte mit einer sehr kurzen, charaktertypischen Begrüßung.' });
  else if (userText) msgs.push({ role:'user', content: userText });
  return msgs;
}

async function callOpenAI({ messages, model, max_tokens=110 }){
  const r = await fetch(OPENAI_URL, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens,
      frequency_penalty: 0.4,
      presence_penalty: 0.1,
      messages
    })
  });
  const raw = await r.text();
  if(!r.ok){ const err=new Error('OpenAI error'); err.detail=raw; throw err; }
  const json = JSON.parse(raw);
  return (json?.choices?.[0]?.message?.content || '').trim();
}

function limitSentences(text, maxSentences=2){
  const parts = text.split(/([.!?])\s+/).reduce((acc, cur, i, arr)=>{
    if(i%2===0){ const p = cur + (arr[i+1]||''); acc.push(p.trim()); }
    return acc;
  }, []);
  let out = parts.slice(0, maxSentences).join(' ');
  if(out.length>180) out = out.slice(0,177).trim()+'…';
  return out.replace(/\n{2,}/g,'\n');
}

// einfache, günstige Memory-Extraktion (optional)
function memoryExtractorPrompt(userText, assistantText){
  return `Extrahiere aus dem folgenden kurzen Dialog maximal 1 langlebige, nützliche Tatsache über den Nutzer (wenn vorhanden).
Gib ein JSON-Array von Objekten: [{"key":"...","value":"..."}] oder [].
Bevorzuge stabile Präferenzen (z.B. mag X, wohnt in Y, Ziel Z).

Nutzer: ${userText||''}
Antwort: ${assistantText||''}`;
}

exports.handler = async (event)=>{
  if(event.httpMethod!=='POST') return { statusCode:405, body:'Method Not Allowed' };
  try{
    const body = JSON.parse(event.body||'{}');
    const persona = body.persona || { name:'Chatpartner', tag: body.mode==='freechat'?'Freechat':'', desc: body.setting||'Freundlich, kurz.' };
    const start    = !!(body.payload && body.payload.start);
    const userText = body.payload?.userText ? String(body.payload.userText) : '';
    const history  = Array.isArray(body.history) ? body.history : [];

    const messages = buildMessages({ persona, history, userText, start });

    let reply;
    try{ reply = await callOpenAI({ messages, model: PRIMARY_MODEL }); }
    catch(e){ if((e.detail||'').includes('model')||(e.detail||'').includes('not permitted')) reply = await callOpenAI({ messages, model: FALLBACK_MODEL });
              else throw e; }

    const concise = limitSentences(reply);

    // optional: kleine Memory-Extraktion nur bei normalem Usertext
    let memoryUpdates = [];
    if (userText) {
      try{
        const memMsg = [
          { role:'system', content:'Du bist ein knapper JSON-Extraktor.' },
          { role:'user', content: memoryExtractorPrompt(userText, concise) }
        ];
        let memRaw = await callOpenAI({ messages: memMsg, model: PRIMARY_MODEL, max_tokens: 120 });
        // best effort parse
        const m = memRaw.match(/\[[\s\S]*\]/);
        if(m){ memoryUpdates = JSON.parse(m[0]); }
      }catch(_e){ /* still cheap & optional */ }
    }

    return {
      statusCode:200,
      headers:{ 'Content-Type':'application/json','Cache-Control':'no-store' },
      body: JSON.stringify({
        messages: [ { role:'character', name: persona.name||'Chatpartner', text: concise } ],
        choices: [],
        progress: 50,
        memoryUpdates
      })
    };
  }catch(e){
    return { statusCode:500, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:e.message, detail:e.detail||null }) };
  }
};

