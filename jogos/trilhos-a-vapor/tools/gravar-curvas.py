# Troca o objeto BENDS do map-usa.js pelas curvas sugeridas pelo ajustar-curvas.mjs.
# Uso: python tools/gravar-curvas.py public/map-usa.js '{"sea-cal": 17.3, ...}'
import json, re, sys
path, values = sys.argv[1], json.loads(sys.argv[2])
NOTES = {
    'cal-win': 'arco por cima, perto da fronteira', 'por-sfo': 'pela costa', 'sfo-lax': 'pela costa',
    'lax-elp': 'arco por baixo de Phoenix', 'elp-hou': 'arco pelo sul', 'nor-mia': 'pela costa do golfo',
    'ssm-mon': 'arco por cima dos lagos',
}
s = open(path, encoding='utf-8').read()
a = s.index('const BENDS = {')
b = s.index('};', a) + 2
lines = ['const BENDS = {']
for key, v in values.items():
    if abs(v) < 0.05:
        continue
    num = int(v) if float(v).is_integer() else v
    note = f' // {NOTES[key]}' if key in NOTES else ''
    lines.append(f"  '{key}': {num},{note}")
lines.append('};')
s = s[:a] + '\n'.join(lines) + s[b:]
open(path, 'w', encoding='utf-8').write(s)
print('ok', len(lines) - 2, 'curvas')
