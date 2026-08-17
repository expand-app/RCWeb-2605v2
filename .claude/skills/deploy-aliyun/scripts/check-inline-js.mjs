/**
 * 检查 index.html 里内联 <script> 的 JS 语法。
 *
 * 为什么需要:  整站的路由、案例、文章数据都写在 index.html 的内联 <script> 里。
 * 改文案时如果碰坏了引号、括号或逗号，页面在浏览器里会直接白屏 —— 但 GitHub Actions
 * 的部署照样会成功（它只是把文件传上去，不执行 JS）。也就是说**部署是绿的，线上却是坏的**。
 * 这个检查就是为了在推之前把这种事故拦下来。
 *
 * 只编译、不执行（vm.Script 编译期就能抓出语法错误），所以对仓库没有任何副作用。
 *
 * 用法:  node .claude/skills/deploy-aliyun/scripts/check-inline-js.mjs [文件]
 *        默认检查当前目录的 index.html
 * 退出码: 0 = 语法没问题, 1 = 有语法错误
 */
import fs from 'fs';
import vm from 'vm';

const file = process.argv[2] || 'index.html';
const html = fs.readFileSync(file, 'utf8');

// 跳过外链脚本(src=)和 JSON-LD(type=...json) —— 前者不在这个文件里，后者不是 JS。
const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m, checked = 0, bad = 0;

while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || '';
  if (/\bsrc=/.test(attrs)) continue;
  if (/type\s*=\s*["'][^"']*json/i.test(attrs)) continue;

  checked++;
  const line = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(m[2], { filename: `${file}:${line}` });
  } catch (e) {
    bad++;
    console.error(`语法错误 · <script> 开始于 ${file}:${line}`);
    console.error(`  ${e.message}`);
  }
}

if (bad === 0) {
  console.log(`${checked} 段内联 JS 语法正常`);
  process.exit(0);
}
console.error(`\n${checked} 段内联 JS 里有 ${bad} 段语法错误 —— 推上去线上页面会白屏。`);
console.error('部署本身不会因此失败，所以一定要在这里修掉。');
process.exit(1);
