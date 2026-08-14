// Staging file for the new `pd` (AI 产品) Background Boost direction.
// Content transcribed from the user-supplied spec doc. Injected into
// index.html's BG_DATA by scripts/add_pd_direction.py, then this file is
// deleted — it is not part of the shipped site.
//
// Structure mirrors BG_DATA.se exactly (name/titleCn/titleEn/eyebrow/lead/
// facts/overviewLead/overviewBody/tags/highlights/modules/faq).

module.exports = {
  name: 'AI 产品',
  titleCn: 'AI 产品实习',
  titleEn: 'AI Product Internship',
  eyebrow: 'Background Boost · 工业级远程实习',
  lead: '在 Puebulo（AI 面试科技公司）任职，从 0 到 1 交付一款面向北美求职者的 AI 面试教练产品——从用户访谈、需求定义、界面设计，到多模态采集、AI 评分、实时语音模拟面试，再到上线、线上故障与三轮迭代。全程不写一行代码：代码与界面全部由 Claude 产出，你负责定义、审查与决策。零代码基础也能交付一款真实上线的产品。',
  facts: [
    { k: 'Duration', v: '60 – 80 小时', s: '12 周 · 三大模块 · 单节 1–2 小时' },
    { k: 'Industry', v: 'AI / 教育科技', s: '真实上线产品 · 真实用户 · 真实线上故障' },
    { k: 'Suited For', v: '零代码基础', s: 'PM / Product Analytics / UI-UX / AI 产品工程 四方向' },
    { k: 'Format', v: '远程直播', s: '录播回放 · Office Hour · 需求与产出走查' }
  ],
  overviewLead: '实习生将在 Puebulo（AI 面试科技公司）任职，从零参与一款真实上线产品的完整生命周期：需求定义 → 产品设计 → 开发上线 → 三轮迭代。整个过程不需要写代码——所有实现都交给 Claude，学员的工作是把需求说清楚、把产出看明白、把问题定位准。',
  overviewBody: [
    '第一阶段是产品定义。从用户访谈出发，把「我想多练几次面试」这样一句模糊的诉求，收敛成一条能指导决策的 User Story；再通过竞品调研找到市场空白——「实时作弊」赛道很拥挤，「事后复盘」几乎是空的；最后产出需求文档与可测的验收标准。这一阶段完全由自然语言驱动，同学会亲眼看到 AI 把边界情况列全，是怎么把返工挡在开发之前的。',
    '第二阶段是开发与上线，同样一行代码都不用写。界面不经过静态设计稿——直接让 Claude 产出可运行的真实界面，然后在跑起来的产品上迭代，这是有了 AI 之后设计流程最大的变化。产品要同时处理音频、视频与文本三种模态，因此要连续翻过三道坎：听得见（采集与流式转写）、分得清（说话人分离与角色识别）、抓得准（从连续对话流里锁定真正的面试问题）。随后是数据完整性与云端部署。',
    '第三阶段是迭代与 AI 质量工程。三轮迭代分别对应三类典型难题：录播花屏（当修复本身就是故障）、打分不稳定（如何给一个会瞎编的概率系统设计守门规则与可复现性）、Retake 实时语音面试（一次架构再决策，以及推翻自己的勇气）。最后一周做模型分层选型与单位成本建模——这是 AI 产品岗真正的隐藏必修课。'
  ],
  tags: ['零代码', 'Claude Code', 'AI-Assisted Development', 'User Research', '需求定义', 'MVP Scoping', 'Prompt Engineering', 'Multimodal', 'Speech-to-Text', 'LLM Evaluation', 'Cost Modeling', 'AWS'],
  highlights: [
    { t: '零代码交付上线产品', d: '不写一行代码，但产品真实上线、有真实用户、有真实故障与回滚记录。完成后可直接写入简历的 4 条工业级 bullet points。点击预览 →', svg: '<rect x="5" y="2" width="14" height="20" rx="1.5"/><path d="M9 7h6M9 11h6M9 15h4"/>', action: 'open-resume' },
    { t: 'AI-Native 工作方式', d: '需求、界面、实现、文档全部由 Claude 产出。你练的是新岗位真正要的能力：把需求说清楚、把产出审明白、把问题定位准。', svg: '<path d="M4.5 16.5L3 21l4.5-1.5L18 9l-3-3z"/><path d="M15 6l3 3"/>' },
    { t: '概率系统的质量工程', d: '学会给「会瞎编的系统」设计验收标准、守门规则与可复现性——传统 QA 那套在这里失效。', svg: '<path d="M12 2l8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>' },
    { t: '可验证的作品集', d: '上线产品链接 + 完整需求与迭代决策记录，简历可直接附 link 展示。', svg: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>' }
  ],
  modules: [
    {
      id: 'pd-m1', tnum: '01', tname: '需求与定义',
      title: '从用户需求到产品定义', titleEn: 'From User Need to Product Definition',
      meta: [['Duration', '3 周'], ['Stack', 'User Research + Claude'], ['Per Session', '1 – 2 小时']],
      desc: '不碰实现的三周。从用户访谈开始，走完需求定义、竞品调研、需求文档与验收标准的完整链路。重点不是「文档模板长什么样」，而是有了 AI 之后，这三件事哪些变了、哪些完全没变、哪些反而更难了。',
      visual: `
          <div class="curr-visual">
            <div class="cv-label">Module Preview <span class="cv-sub">User Research → PRD · Definition Pipeline</span></div>
            <div class="pd-flow">
              <div class="pd-flow-row">
                <div class="pd-node pd-node-raw">
                  <div class="pd-node-lbl">RAW INPUT</div>
                  <div class="pd-node-quote">"我想多练几次面试"</div>
                  <div class="pd-node-meta">用户访谈 · 12 段录音</div>
                </div>
                <div class="pd-arrow">→</div>
                <div class="pd-node pd-node-story">
                  <div class="pd-node-lbl">USER STORY</div>
                  <div class="pd-node-body">作为求职者，我希望在面试结束后立刻看到自己哪一题答砸了、砸在哪，以便下一场不再犯同样的错。</div>
                  <div class="pd-node-meta">可指导决策 · 可验收</div>
                </div>
              </div>
              <div class="pd-matrix">
                <div class="pd-matrix-lbl">— 竞品矩阵 · 切入点定位</div>
                <div class="pd-matrix-grid">
                  <div class="pd-cell pd-cell-crowded">
                    <div class="pd-cell-k">实时作弊</div>
                    <div class="pd-cell-v">拥挤</div>
                    <div class="pd-cell-dots"><span></span><span></span><span></span><span></span><span></span></div>
                  </div>
                  <div class="pd-cell pd-cell-gap">
                    <div class="pd-cell-k">事后复盘</div>
                    <div class="pd-cell-v">空白</div>
                    <div class="pd-cell-dots"><span class="on"></span></div>
                  </div>
                </div>
              </div>
              <div class="pd-ac">
                <div class="pd-ac-lbl">— 验收标准（节选）</div>
                <div class="pd-ac-row"><span class="pd-ac-chk">✓</span> 面试结束后 60 秒内生成完整复盘</div>
                <div class="pd-ac-row"><span class="pd-ac-chk">✓</span> 每道题可定位到原始音频时间点</div>
                <div class="pd-ac-row"><span class="pd-ac-chk">✓</span> 数据不足时明确拒答，不允许编造</div>
              </div>
            </div>
          </div>`,
      weeks: [
        { n: '01', title: 'User Story & 问题定义', items: ['用户访谈脚本设计', '从「我想多练几次」到一句能指导决策的 User Story', '需求真伪判定'] },
        { n: '02', title: '竞品调研与切入点', items: ['拆解实时作弊赛道 vs 事后复盘空白', '竞品矩阵', '定位陈述与差异化'] },
        { n: '03', title: '需求文档与验收标准', items: ['用 AI 把边界情况列全', 'MVP 范围切割', '验收标准怎么写才可测', '什么该砍掉'] }
      ]
    },
    {
      id: 'pd-m2', tnum: '02', tname: '开发与上线',
      title: '零代码开发与上线', titleEn: 'Ship It Without Writing Code',
      meta: [['Duration', '5 周'], ['Stack', 'Claude Code + AWS'], ['Per Session', '1 – 2 小时']],
      desc: '把需求变成一个真实可访问的产品，全程用自然语言驱动 Claude 完成实现。界面不画静态稿——直接产出可运行的真实界面，在跑起来的产品上迭代。核心难点是多模态：音频、视频、文本三条流要同时可靠。',
      visual: `
          <div class="curr-visual">
            <div class="cv-label">Module Preview <span class="cv-sub">Multimodal Pipeline · 三道坎</span></div>
            <div class="pd-hurdles">
              <div class="pd-hurdle">
                <div class="pd-hurdle-num">01</div>
                <div class="pd-hurdle-body">
                  <div class="pd-hurdle-t">听得见</div>
                  <div class="pd-hurdle-en">Capture &amp; Streaming Transcription</div>
                  <div class="pd-hurdle-chips"><span>音频采集</span><span>设备权限</span><span>流式转写</span><span>断线降级</span></div>
                </div>
              </div>
              <div class="pd-hurdle">
                <div class="pd-hurdle-num">02</div>
                <div class="pd-hurdle-body">
                  <div class="pd-hurdle-t">分得清</div>
                  <div class="pd-hurdle-en">Speaker Diarization</div>
                  <div class="pd-hurdle-chips"><span>说话人分离</span><span>角色识别</span><span>重连缓冲</span></div>
                </div>
              </div>
              <div class="pd-hurdle">
                <div class="pd-hurdle-num">03</div>
                <div class="pd-hurdle-body">
                  <div class="pd-hurdle-t">抓得准</div>
                  <div class="pd-hurdle-en">Question Detection</div>
                  <div class="pd-hurdle-chips"><span>锁定真问题</span><span>提示词阶梯</span><span>四层过滤</span></div>
                </div>
              </div>
            </div>
            <div class="pd-ship">
              <div class="pd-ship-lbl">— 上线</div>
              <div class="pd-ship-row">
                <span class="pd-ship-step">数据完整性</span>
                <span class="pd-ship-arr">→</span>
                <span class="pd-ship-step">云端部署</span>
                <span class="pd-ship-arr">→</span>
                <span class="pd-ship-step pd-ship-live">第一批真实故障</span>
              </div>
            </div>
          </div>`,
      weeks: [
        { n: '04', title: '界面直出与交互定义', items: ['跳过静态设计稿', '让 Claude 直接产出可运行界面', '在真实产品上迭代交互'] },
        { n: '05', title: '多模态第一道坎：听得见', items: ['音频采集与设备权限', '流式转写接入', '断线与降级策略'] },
        { n: '06', title: '多模态第二道坎：分得清', items: ['说话人分离', '面试官 / 候选人角色识别', '重连与缓冲'] },
        { n: '07', title: '多模态第三道坎：抓得准', items: ['从连续对话流锁定真问题', '提示词升级阶梯', '先便宜后昂贵的四层过滤'] },
        { n: '08', title: '数据完整性与上线', items: ['用户以为存好了其实没有', '上传失败的兜底', '云端部署', '上线后第一批真实故障'] }
      ]
    },
    {
      id: 'pd-m3', tnum: '03', tname: '迭代与质量工程',
      title: '迭代与 AI 质量工程', titleEn: 'Iteration & AI Quality Engineering',
      meta: [['Duration', '4 周'], ['Stack', 'LLM Evaluation + 成本建模'], ['Per Session', '1 – 2 小时']],
      desc: '上线只是开始。三轮真实迭代，每一轮都对应一类 AI 产品的典型难题；最后一周做模型分层选型与单位成本建模——这是校内项目几乎不会涉及、但工作第一天就会遇到的能力。',
      visual: `
          <div class="curr-visual">
            <div class="cv-label">Module Preview <span class="cv-sub">Model Tiering · 单位成本模型</span></div>
            <div class="pd-cost">
              <div class="pd-cost-head">
                <span>一场 30 分钟面试 · 1,000+ 次模型调用</span>
                <span class="pd-cost-head-r">95% 为轻量档</span>
              </div>
              <div class="pd-cost-rows">
                <div class="pd-cost-row">
                  <div class="pd-cost-k">状态分类</div>
                  <div class="pd-cost-bar"><span class="pd-bar pd-bar-light" style="width:70%"></span></div>
                  <div class="pd-cost-n">~700 次</div>
                  <div class="pd-cost-tier pd-tier-light">轻量档</div>
                </div>
                <div class="pd-cost-row">
                  <div class="pd-cost-k">问题检测</div>
                  <div class="pd-cost-bar"><span class="pd-bar pd-bar-light" style="width:30%"></span></div>
                  <div class="pd-cost-n">~300 次</div>
                  <div class="pd-cost-tier pd-tier-light">轻量档</div>
                </div>
                <div class="pd-cost-row">
                  <div class="pd-cost-k">实时点评</div>
                  <div class="pd-cost-bar"><span class="pd-bar pd-bar-mid" style="width:4%"></span></div>
                  <div class="pd-cost-n">~40 次</div>
                  <div class="pd-cost-tier pd-tier-mid">中档</div>
                </div>
                <div class="pd-cost-row">
                  <div class="pd-cost-k">整场评分</div>
                  <div class="pd-cost-bar"><span class="pd-bar pd-bar-mid" style="width:1%"></span></div>
                  <div class="pd-cost-n">1 次</div>
                  <div class="pd-cost-tier pd-tier-mid">中档</div>
                </div>
              </div>
              <div class="pd-cost-note">
                全用旗舰档 → 总成本 <strong>5×</strong>，质量几乎无提升。<br>
                压上下文比换模型更省：数千字资料压到约 50 字，效果不变、token 省一个数量级。
              </div>
            </div>
          </div>`,
      weeks: [
        { n: '09', title: '迭代一：录播花屏', items: ['当修复本身就是故障', '四部曲复盘', '先加可观测性再猜原因'] },
        { n: '10', title: '迭代二：让打分稳定', items: ['评分体系设计', '业务规则该写在哪一层', '可复现性与硬性守门'] },
        { n: '11', title: '迭代三：Retake 实时语音', items: ['一次架构再决策', '实时语音对话', '打断与回声', '推翻自己的勇气'] },
        { n: '12', title: '成本控制与结课 Demo', items: ['模型分层选型', '单位成本模型', '首字延迟 vs 总耗时', '上线复盘与 Demo'] }
      ]
    }
  ],
  faq: [
    { q: '实习岗位 title 可以写成什么？', a: '可根据求职方向选用：<ul><li>Product Manager Intern</li><li>Product Analyst Intern</li><li>Product Designer (UX) Intern</li><li>AI Product Engineer Intern</li></ul>' },
    { q: '简历上公司名称怎么写？', a: '项目公司是 Puebulo，一家 AI 教育科技公司，主要业务是面向北美求职者的 AI 面试复盘与模拟面试产品。' },
    { q: '简历 Skills 可以添加哪些技能？', a: '<ul><li>Product Requirement Definition / User Research</li><li>MVP Scoping / Acceptance Criteria</li><li>AI-Assisted Development / Claude Code</li><li>Prompt Engineering / LLM Evaluation</li><li>Product Analytics / A-B Testing</li><li>Cost Modeling / Unit Economics</li><li>Production Deployment / Incident Review</li></ul>' },
    { q: '没有编程经验能学吗？', a: '这正是本项目的设计前提。全程不写一行代码——所有实现都由 Claude 完成，你的工作是把需求说清楚、审查产出、定位问题、做决策。四个方向都不要求编程基础，也不要求会用设计软件。' },
    { q: '完全不写代码，产出还能算数吗？', a: '产品是真实上线的，有真实用户、真实故障和回滚记录，链接可直接放进简历。区别在于你交付它的方式——这恰恰是现在企业最想要的能力：能指挥 AI 完成交付、并且判断得出产出是对是错。判断力比手写代码更难被替代。' },
    { q: '四个方向可以只选一个吗？', a: '主线课程是同一条——所有人一起走完从需求到上线的全流程。四个方向的差异在交付物与简历呈现：PM 交需求定义与迭代决策记录，PA 交指标体系与成本模型，UX 交交互规范与可用性迭代记录，AI 产品工程交系统设计与线上故障复盘。' },
    { q: '需要付费的 AI / 云服务吗？', a: '课程会专门带你做模型分层选型与成本控制，整体在低成本档位内可控；云服务在 Free Tier 内基本够用。' }
  ]
};
