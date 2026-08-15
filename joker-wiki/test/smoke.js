/* 临时冒烟测试：验证 markdown 渲染与 GitHub API 链路（node 环境模拟） */
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
global.window = { markdownit: require(path.join(root, "lib", "markdown-it.min.js")) };
// 模拟 app.js 提供的双链解析器：Home 存在，其余不存在
window.WikiResolver = (t) => (t === "Home")
  ? { path: "Home", exists: true, title: "Home" }
  : { path: t, exists: false, title: t.split("/").pop() };

for (const f of ["js/markdown.js", "js/api.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}

// ---- 测试 markdown 渲染 ----
const out1 = vm.runInThisContext(
  'Render.render("# 标题一\\n\\n[[Home]] 与 [[不存在|别名]] 以及 [外链](https://example.com)\\n\\n```js\\nvar a = 1;\\n```")'
);
console.log("--- render output ---");
console.log(out1);
if (!out1.includes('class="wikilink"')) throw new Error("双链渲染失败");
if (!out1.includes("wikilink-missing")) throw new Error("红链渲染失败");
if (!out1.includes('target="_blank"')) throw new Error("外链新窗口失败");
if (!out1.includes('id="标题一"')) throw new Error("标题锚点失败");
if (!out1.includes("<pre><code")) throw new Error("代码块渲染失败");

// ---- 测试 API 网络链路（读取一个必然 404 的路径）----
vm.runInThisContext(
  'API.configure({owner:"octocat",repo:"Hello-World",branch:"master",wikiDir:"wiki"},"")'
);
vm.runInThisContext(
  'API.readPage("不存在的页面").then(() => { throw new Error("应当 404"); })' +
  '.catch(e => { if (e.message !== "PAGE_NOT_FOUND") throw e; console.log("API 网络链路 OK（404 → PAGE_NOT_FOUND）"); })'
).then(() => console.log("ALL TESTS PASSED"));
