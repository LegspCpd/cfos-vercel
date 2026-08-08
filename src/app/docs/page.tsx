import { readFileSync } from 'node:fs';
import path from 'node:path';
import DocViewer from './DocViewer';

// Server component: reads the markdown doc at build/runtime and renders it via the client viewer.
export default function DocsPage() {
  const filePath = path.join(process.cwd(), 'src', 'content', 'deploy-doc.md');
  let content = '';
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    content = '# 文档未找到\n\n请检查 `src/content/deploy-doc.md` 是否存在。';
  }
  return <DocViewer content={content} />;
}
