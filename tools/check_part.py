"""Validasi satu file resep: python tools/check_part.py data/recipes/part-a.json"""
import json, sys
base = json.load(open('data/ingredients.json', encoding='utf-8'))['ingredients']
part = json.load(open(sys.argv[1], encoding='utf-8'))
vocab = {i['id']: i for i in base}
errs = []
for n in part.get('newIngredients', []):
    if n['id'] in vocab: errs.append('newIngredient sudah ada di kosakata: ' + n['id'])
    if n.get('category') not in ('protein', 'sayur', 'bumbu', 'misc'): errs.append('kategori salah: ' + n['id'])
    vocab[n['id']] = n
for r in part['recipes']:
    for k in ('id', 'name', 'type', 'timeMinutes', 'servings', 'ingredients', 'steps'):
        if k not in r: errs.append(f"{r.get('id')}: field {k} hilang")
    for ing in r.get('ingredients', []):
        if ing.get('id') not in vocab: errs.append(f"{r['id']}: bahan tidak dikenal {ing.get('id')}")
        q = ing.get('qty')
        if q is not None and not isinstance(q, (int, float)): errs.append(f"{r['id']}: qty bukan angka {ing}")
    if len(r.get('steps', [])) < 3: errs.append(f"{r['id']}: langkah terlalu sedikit")
print('\n'.join(errs) if errs else f"OK: {len(part['recipes'])} resep")
