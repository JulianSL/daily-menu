"""Gabungkan data resep menjadi satu sumber untuk web app dan aplikasi iOS.

Jalankan dari folder proyek:  python tools/build_data.py

Masukan : data/ingredients.json, data/menus.json, data/recipes/part-*.json
Keluaran: data/recipes.json            (gabungan resep + kosakata bahan)
          web/data.js                  (window.APP_DATA untuk web app)
          ios/MenuMingguan.swiftpm/Resources/appdata.json  (untuk aplikasi SwiftUI)
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return json.load(f)


def main():
    ingredients = read('data/ingredients.json')['ingredients']
    menus = read('data/menus.json')
    vocab = {i['id']: i for i in ingredients}
    recipes = {}
    errors = []

    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'recipes', 'part-*.json'))):
        part = json.load(open(path, encoding='utf-8'))
        for n in part.get('newIngredients', []):
            if n['id'] in vocab and vocab[n['id']].get('unit') != n.get('unit'):
                errors.append(f"{os.path.basename(path)}: bahan {n['id']} unit bentrok")
            vocab.setdefault(n['id'], {k: n[k] for k in ('id', 'name', 'category', 'unit')})
        for r in part['recipes']:
            if r['id'] in recipes:
                errors.append(f"resep ganda: {r['id']}")
            recipes[r['id']] = r

    expected = [m['id'] for m in menus['mains']] + [s['id'] for s in menus['sides']] + [k['id'] for k in menus['kids']]
    missing = [i for i in expected if i not in recipes]
    for r in recipes.values():
        for ing in r['ingredients']:
            if ing['id'] not in vocab:
                errors.append(f"{r['id']}: bahan tidak dikenal {ing['id']}")

    if errors:
        print('GAGAL:\n  ' + '\n  '.join(errors))
        sys.exit(1)

    data = {
        'ingredients': sorted(vocab.values(), key=lambda i: (i['category'], i['name'])),
        'menus': menus,
        'recipes': recipes,
    }
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'recipes.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'web', 'data.js'), 'w', encoding='utf-8') as f:
        f.write('// Dibuat otomatis oleh tools/build_data.py — jangan diedit langsung.\n')
        f.write('window.APP_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    ios = os.path.join(ROOT, 'ios', 'MenuMingguan.swiftpm', 'Resources')
    os.makedirs(ios, exist_ok=True)
    with open(os.path.join(ios, 'appdata.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

    print(f"OK: {len(recipes)} resep, {len(vocab)} bahan.")
    if missing:
        print(f"Belum ada resep untuk {len(missing)} menu: {', '.join(missing[:8])}{' …' if len(missing) > 8 else ''}")


if __name__ == '__main__':
    main()
