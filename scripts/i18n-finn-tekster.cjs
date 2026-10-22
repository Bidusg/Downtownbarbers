// Finner norske tekster i back-office som MANGLER engelsk i
// src/lib/i18n/backoffice-en.json. Kjør: node scripts/i18n-finn-tekster.cjs
// Resultat: scripts/i18n-mangler.json (oversett og legg inn i ordlista).
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..', 'src');
const dirs = ['app/admin','app/kasse','app/revisor','app/ansatt','app/min-profil','app/ingen-tilgang','app/logg-inn','app/glemt-passord','app/tilbakestill','app/sjekk-epost','app/auth-actions.ts',
  'components/admin','components/kasse','components/revisor','components/ansatt','components/backoffice','components/ui','components/membership','lib'];
const SKIP_ATTR = new Set(['className','href','src','id','key','type','name','htmlFor','rel','target','method','role','d','viewBox','fill','stroke','strokeWidth','strokeLinecap','strokeLinejoin','xmlns','accept','autoComplete','inputMode','encType','action','as','tone','variant','size','align','mode','kind','pattern','lang','dir','data-testid','sizes','loading','decoding','referrerPolicy','spellCheck','style','form','formAction','points','transform','preserveAspectRatio','cx','cy','r','x','y','x1','x2','y1','y2','width','height','min','max','step','defaultValue','value']);
const files = [];
function walk(p){ const st=fs.statSync(p); if(st.isDirectory()){ for(const f of fs.readdirSync(p)) walk(path.join(p,f)); } else if(/\.(tsx?|ts)$/.test(p) && !/\.d\.ts$/.test(p)) files.push(p); }
for (const d of dirs) { const p = path.join(ROOT,d); if (fs.existsSync(p)) walk(p); }
// lib: only files likely user-facing
const out = new Map();
function add(s, file){ s = s.replace(/\s+/g,' ').trim(); if(!s) return; if(s.length<2||s.length>400) return;
  if(!/[A-Za-zÆØÅæøå]/.test(s)) return;
  if(/^[a-z0-9_\-:/.\[\]#%()=,|*+@!?'"]+$/.test(s) && !/[æøå]/.test(s) && !/ /.test(s)) { // single token lowercase — likely code, keep only if norwegian-ish word list later
    if(s.length<3) return; }
  if(/^(https?:|\/|@\/|\.\/|#)/.test(s)) return;
  if(/^[\w-]+(\s+[\w:\[\]\/.%#()-]+)+$/.test(s) && /(^|\s)(flex|grid|text-|bg-|px-|py-|mt-|mb-|rounded|border|w-|h-|items-|justify-|gap-|font-|hover:|sm:|md:|lg:)/.test(s)) return;
  if(/^(select|insert|update|delete|from|where)\b/i.test(s) && /[_(*]/.test(s)) return;
  if(/^[a-z_]+(,\s*[a-z_]+)+/.test(s)) return; // column lists
  if(/^[A-Z_]{3,}$/.test(s)) return; // ENV
  if(/^\d/.test(s) && !/[a-zæøå]{3}/i.test(s)) return;
  if(!out.has(s)) out.set(s, file.replace(ROOT+'/',''));
}
for (const f of files) {
  if (f.includes('/lib/i18n/')) continue;
  const src = fs.readFileSync(f,'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function attrName(n){ let p=n.parent; while(p && (ts.isJsxExpression(p)||ts.isParenthesizedExpression(p)||ts.isConditionalExpression(p)||ts.isBinaryExpression(p)||ts.isTemplateSpan(p)||ts.isTemplateExpression(p))) p=p.parent; return p && ts.isJsxAttribute(p) ? p.name.getText() : null; }
  function visit(n){
    if (ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) add(n.getText(), f);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p=n.parent;
      if (ts.isPropertyAssignment(p) && p.name===n) {} // object key
      else if (ts.isElementAccessExpression(p)) {}
      else if (ts.isCallExpression(p) && /^(from|select|eq|rpc|order|in|neq|is|gte|lte|lt|gt|maybeSingle|single|upsert|getItem|setItem|querySelector|querySelectorAll|addEventListener|removeEventListener|get|has|startsWith|endsWith|includes|split|replace|test|toLocaleDateString|toLocaleString|toLocaleTimeString|padStart|join|redirect|revalidatePath|revalidateTag|updateTag|fetch|require|matchMedia|createElement|getElementById|toFixed|localeCompare|filter|ilike|like|or|range|limit|storage|upload|remove|createSignedUrl|getPublicUrl|channel|on)$/.test(p.expression.getText().split('.').pop())) {}
      else if (ts.isLiteralTypeNode(p)) {}
      else if (ts.isCaseClause(p)) {}
      else if (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText())) {}
      else { const a=attrName(n); if(a && SKIP_ATTR.has(a)) {} else add(n.text, f); }
    } else if (ts.isTemplateExpression(n)) {
      const a=attrName(n); if(!(a && SKIP_ATTR.has(a))) {
        add(n.head.text, f); for (const sp of n.templateSpans) add(sp.literal.text, f);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
// lib: keep only strings that look like sentences/messages (have space or æøå and uppercase start)
const have = require(path.join(__dirname,'..','src','lib','i18n','backoffice-en.json'));
const arr=[...out.entries()].filter(([s])=>!have[s.replace(/\s+/g,' ').trim()]).filter(([s,f])=> !f.startsWith('lib/') || (/^[A-ZÆØÅ]/.test(s) && (/ /.test(s)||/[æøå]/i.test(s))));
fs.writeFileSync(path.join(__dirname, 'i18n-mangler.json'), JSON.stringify(arr.map(([s,f])=>({s,f})),null,0));
console.log(files.length,'files', arr.length,'strings', arr.reduce((a,[s])=>a+s.length,0),'chars');
