/* ==========================================================================
   教程.js —— Angel的HTML教程 · 交互增强
   结构 / 表现 / 行为分离：本文件只负责"行为"
   ========================================================================== */
(() => {
  "use strict";

  var SUB_IDS = ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
  var sidenav = document.querySelector(".sidenav");
  var main = document.querySelector(".main");
  var groupLink = sidenav ? sidenav.querySelector('a[href="#7"]') : null;
  var heads = main ? Array.prototype.slice.call(main.querySelectorAll("h2[id], h4[id]")) : [];

  function linkFor(id) {
    return sidenav ? sidenav.querySelector('a[href="#' + id + '"]') : null;
  }

  /* ---------- 1. "HTML常用标签"子菜单 折叠 / 展开 ---------- */
  function setGroup(open) {
    document.body.classList.toggle("subnav-open", open);
    if (groupLink) groupLink.textContent = open ? "HTML常用标签 ▲" : "HTML常用标签 ▼";
  }
  if (groupLink) {
    groupLink.addEventListener("click", function () {
      setGroup(!document.body.classList.contains("subnav-open"));
    });
  }

  /* ---------- 2. 滚动监听：高亮当前章节 ---------- */
  function highlight() {
    var threshold = window.scrollY + (window.innerWidth < 960 ? 100 : 150);
    var current = null;
    heads.forEach(function (h) {
      var top = h.getBoundingClientRect().top + window.scrollY;
      if (top <= threshold) current = h;
    });
    if (!current) return;

    var links = sidenav.querySelectorAll("a.active");
    Array.prototype.forEach.call(links, function (a) { a.classList.remove("active"); });

    var link = linkFor(current.id);
    if (link) link.classList.add("active");

    if (SUB_IDS.indexOf(current.id) !== -1) {
      if (groupLink) groupLink.classList.add("active");
      if (!document.body.classList.contains("subnav-open")) setGroup(true);
    }
  }

  /* ---------- 3. 阅读进度条 ---------- */
  var progress = document.createElement("div");
  progress.id = "reading-progress";
  document.body.appendChild(progress);

  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
  }

  /* ---------- 4. 返回顶部按钮 ---------- */
  var backTop = document.createElement("button");
  backTop.type = "button";
  backTop.className = "back-top";
  backTop.setAttribute("aria-label", "返回顶部");
  backTop.innerHTML = "&#8593;";
  document.body.appendChild(backTop);
  backTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  function updateBackTop() {
    backTop.classList.toggle("show", window.scrollY > 480);
  }

  /* ---------- 5. 示例代码 一键复制 ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".演示"), function (box) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.textContent = "复制";
    btn.addEventListener("click", function () {
      var text = box.innerText.replace(/^\s*(代码示例|要点提示)\s*/, "").trim();
      var done = function (ok) {
        btn.textContent = ok ? "已复制 ✓" : "复制失败";
        setTimeout(function () { btn.textContent = "复制"; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { done(true); },
          function () { done(false); }
        );
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        ta.remove();
        done(ok);
      }
    });
    box.appendChild(btn);
  });

  /* ---------- 滚动合并更新（rAF 节流） ---------- */
  var ticking = false;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      highlight();
      updateProgress();
      updateBackTop();
    });
  });

  /* ---------- 初始状态 ---------- */
  if (/^#(8|9|1[0-8])$/.test(location.hash)) setGroup(true);
  highlight();
  updateProgress();
  updateBackTop();
})();
