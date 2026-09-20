#!/usr/bin/env python3
"""Export v2 into a new directory without recordings or the original history."""
import argparse
from pathlib import Path
import shutil

V2 = Path(__file__).resolve().parents[1]
FILES = ('index.html', 'workbench.html', 'live.html', '_selftest.html',
         'config.js', 'README.md', 'PUBLISH.md', 'audio-manifest.example.json')
FOLDERS = {'assets': {'.js', '.css'}, 'content': {'.md'},
           'backend': {'.gs', '.md'}, 'scripts': {'.py'}, 'tests': {'.cjs', '.py'}}

WORKFLOW = '''name: Publish v2
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - name: Test audio access and publishing
        run: |
          node --test v2/tests/audio.test.cjs
          python3 -m unittest discover -s v2/tests -p '*_test.py'
      - uses: actions/configure-pages@v5
      - name: Prepare public website
        run: |
          mkdir -p _site/v2
          cp index.html _site/
          cp v2/index.html v2/workbench.html v2/live.html v2/config.js _site/v2/
          cp -R v2/assets v2/content _site/v2/
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site
      - uses: actions/deploy-pages@v4
        id: deployment
'''


def prepare(target):
    target = Path(target).resolve()
    if target.exists():
        raise FileExistsError(f'Refusing to overwrite existing directory: {target}')
    sources = [V2 / name for name in FILES]
    for name, extensions in FOLDERS.items():
        sources.extend(p for p in (V2 / name).rglob('*')
                       if p.is_file() and p.suffix in extensions)
    for source in sources:
        if not source.is_file() or source.is_symlink() or V2 not in source.resolve().parents:
            raise ValueError(f'Missing or unsafe export source: {source}')
    # Validate every source before creating the output. Never copy .git or audio/.
    target.mkdir(parents=True)
    for source in sources:
        destination = target / 'v2' / source.relative_to(V2)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    (target / '.gitignore').write_text('''audio/
*.m4a
*.mp3
*.wav
*.MP3
*.WAV
**/audio-manifest.json
**/*_全班標註彙整.md
__pycache__/
*.pyc
.DS_Store
node_modules/
_site/
github-v2/
''')
    (target / 'index.html').write_text('''<!doctype html>
<html lang="zh-Hant"><meta charset="utf-8"><title>華語語音工作台</title>
<meta http-equiv="refresh" content="0;url=v2/">
<a href="v2/">開啟華語語音工作台</a></html>
''')
    (target / 'README.md').write_text('''# 華語語音工作台 v2

此發布副本不含錄音、私人對照表或原專案的 Git 歷史。

請先閱讀 [發布清單](v2/PUBLISH.md)，完成 Google 設定並填入
`v2/config.js` 的 `backendUrl`。未設定時，頁面可開啟，但雲端錄音停用。
首次推送後，在 Settings → Pages 選擇 GitHub Actions，再執行 Publish v2。

後續修改請在此 repo commit 並 push；main 分支會自動重新發布。
''')
    workflow = target / '.github/workflows/pages.yml'
    workflow.parent.mkdir(parents=True)
    workflow.write_text(WORKFLOW)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=V2.parent / 'github-v2')
    args = parser.parse_args()
    try:
        output = prepare(args.output)
    except (ValueError, FileExistsError) as error:
        parser.exit(1, f'{error}\n')
    print(f'Prepared clean publication directory: {output}')
    print('See v2/PUBLISH.md inside it for Google setup and GitHub instructions.')
