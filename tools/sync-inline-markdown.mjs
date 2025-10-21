#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const deckPath = resolve(process.cwd(), process.argv[2] ?? 'slides/story_presentation.md');
const indexPath = resolve(process.cwd(), process.argv[3] ?? 'index.html');

async function main() {
  const [markdownRaw, indexRaw] = await Promise.all([
    readFile(deckPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);

  const normalizedMarkdown = markdownRaw.replace(/\r\n/g, '\n').trimEnd();
  const inlineBlockPattern = /    <script type="application\/markdown" id="deck-inline-markdown" hidden>\n[\s\S]*?\n    <\/script>/;

  if (!inlineBlockPattern.test(indexRaw)) {
    throw new Error('index.html に deck-inline-markdown スクリプトブロックが見つかりませんでした。');
  }

  const replacement =
    '    <script type="application/markdown" id="deck-inline-markdown" hidden>\n' +
    normalizedMarkdown +
    '\n    </script>';

  const updatedIndex = indexRaw.replace(inlineBlockPattern, replacement);
  await writeFile(indexPath, updatedIndex, 'utf8');
  console.log('Updated inline markdown from', deckPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
