# 小说方法来源

本账本记录 `laohu-novel` 所用的可复核来源、核读范围、原来源支持的内容和本地操作边界。来源台账用于维护追溯，不作为日常运行时必读文件；运行方法以本 Skill 主文件 `SKILL.md`、按需 `references/` 与内部子级 `skills/` 为准。外文概念、原作处理和本地适配分开说明，不把有限个案写成普遍读者规律。

## 原作与版本

### Dickens《Our Mutual Friend》：分期连载中的长线

- **来源**：Charles Dickens, *Our Mutual Friend*，Project Gutenberg 全文版，含作者后记 “Postscript, In Lieu of Preface”：[全文](https://www.gutenberg.org/files/883/883-h/883-h.htm)。加州大学圣克鲁兹 Dickens Project 的[出版与构思说明](https://dickens.ucsc.edu/omf-scholarly-pages/publication/composition-and-publication/)记录该书的月刊连载与四部/两卷出版设计。
- **复核位置**：Gutenberg 目录行 19–94 列出四部及各章；Postscript 行 14570–14574 讨论 John Harmon/Rokesmith 身份细线从早期提示、长时间不被察觉、持续运作到终局回收，以及十九个月分期阅读时读者未必能提前看见细线与整体图案的关系。Dickens Project 记作 20 期（末期合刊），按四 Books 设计为两卷。
- **来源实际支持**：长线可贯穿很长篇幅而暂不显出整体关系；分期阅读会造成读者暂时看不见全书设计；作品的 Book、卷册与期数是不同层级。
- **本地适配**：仅对明确按期发布/连载的小说，分开维护全书仍在工作的长线、阶段/卷的局部结账、当前发布段的局部结果和跨发布间隔后读者还需要记住的旧事实。阶段转换时先结算人物状态，再由变化推出下一阶段任务；停更回归时把必需旧事实放到当前行动或关系中唤回，不插入脱离行动的长摘要。后两项是面向现代发布媒介的本地流程，Dickens 没有提供平台停更回归方法。
- **运行位置**：内部专项 `skills/laohu-novel-serial/SKILL.md`。不宣称每期或每章都应有 cliffhanger，也不把四 Book 结构套成固定分卷高潮。

### Doyle《The Adventure of Silver Blaze》：侦查型悬疑的信息链

- **来源与版本**：Arthur Conan Doyle, “The Adventure of Silver Blaze” (1892), 收于 *The Memoirs of Sherlock Holmes*；[American Literature 全文](https://americanliterature.com/author/sir-arthur-conan-doyle/short-story/the-adventure-of-silver-blaze)。
- **复核位置**：全文前段网页行 69–78 / L72 写到马房小工放狗，使读者知道狗在场；L320–326 记 Holmes 让人注意狗夜里没有叫；L378–394 将狗的沉默、访客是否熟悉、鸦片与现场物证等串成推理并排除其他解释。
- **来源实际支持**：先建立读者可见的常态，再让调查者把一次未发生的反应识别为异常，随后以其他事实补强、筛选解释并回扣早先线索。
- **本地适配**：只用于用户明确要求侦查/解谜并邀请读者跟随事实推理的悬疑。按事件位置分别记录真相事实、调查者知道/推断/误判、读者已读到什么；每项核心推论列出竞争解释与能区分解释的下一项证据；揭晓时回看读者是否有机会读到关键事实。知识受限本身不构成作弊，只有违反本作已建立的叙述承诺、纯为惊讶隐去解谜必需事实，或揭晓才补入决定性规则/证据时，才需调整披露安排。原作结尾集中解释是个案，不要求现代小说照抄，也不泛化到情感张力、危险悬念或开放结局。
- **运行位置**：内部专项 `skills/laohu-novel-suspense/SKILL.md`；一般读者期待仍由 `references/story-design-and-reader-expectation.md` 处理。

### 鲁迅《故乡》：当下注意、记忆联想与重评

- **来源与版本**：鲁迅《故乡》，维基文库《呐喊》收录文本：[页面](https://zh.wikisource.org/zh-hans/少年闰土)（页面标题显示《故乡》，重定向自“少年闰土”；页面说明作品初刊于 1921 年 5 月 1 日《新青年》第九卷第一号，文本署 1921 年 1 月）。本次按页面文本核读，未据此判断不同版本的标点异文。
- **复核位置**：页面正文第 126–132 段，由船中所见阴晦旧乡进入回忆，叙述者发现记忆图像不清，重估悲凉来自景物还是将告别的心绪，再回当下搬家；第 143–151、180–184 段由母亲提闰土触发童年图景并立即接回当前追问；第 226–237 段将成年闰土与“记忆上的闰土”并置，当前称谓改变旧关系的理解；第 280–288 段由退远的故乡进入对隔膜、下一代与希望的自问，并回扣月下瓜地意象。
- **来源实际支持**：本作中能观察到从当下刺激进入记忆、选择具体旧经验、重新理解当前感受/关系并返回当下的连续写法。
- **本地适配**：显式意识运动任务中先标当前锚点和联想接点，只取能改变当前认识、关系或选择的过去细节，再用行动、对白、现实差异或有意保留的意象返场。此处的重评与意象回返本身可构成心理落点，不依赖另添外部动作；五项抓手是按需选用的检查路径而非每段配额。鲁迅的一人称回忆声口和篇幅不推广到第三人称限知或所有心理描写。
- **运行位置**：内部专项 `skills/laohu-novel-interior/SKILL.md`；一般叙述与心理呈现见 `references/narration-and-time.md` 和 `references/prose-realization-and-revision.md`。《故乡》结尾的意象回返亦用作后者的可核成文例。

### 鲁迅《孔乙己》：叙述来源、空间位置与完整话轮

- **来源与版本**：鲁迅《孔乙己》（1919），维基文库《鲁迅全集》收录文本：[全文](https://zh.wikisource.org/zh-hans/孔乙己)。本次核读全文，重点段落 122–140。
- **复核位置与观察**：开篇酒馆柜台、隔间及短衣/长衫顾客位置建立叙述者观察空间和社会位次；孔乙己付款动作与众人称呼、追问和他的辩解相连；第 128 段“听人家背地里谈论”引出读书、营生等身世传闻；第 136 段中秋前酒客先报告孔乙己腿被打折，又转述偷到丁举人家后遭打；掌柜追问后来怎样，酒客以猜测回答。第 137 段叙述者亲见孔乙己伤后回来、坐在柜台下用手走路且满手是泥，未亲见受伤过程；第 138 段掌柜重复记欠账只能证明欠款，不能证明生死；第 140 段叙述者因后来再没见到孔乙己而推想死亡，句末保留推测与内心确信的张力。
- **本地适配**：对话与描写按完整上下文处理：当前说话者想取得、隐瞒、否认、试探或安慰什么；听者如何理解；下一句话或动作怎样接受/抵抗并改变关系。叙述来源按亲见、具名转述、账目/物件记录和人物推论分别写清，且只让它支持原文允许的结论。细节可提供空间辨认、关系证据、推断材料或感受，不按五感配额，也不把一个字或单个动作升格为万能技巧。
- **运行位置**：`references/story-design-and-reader-expectation.md`、`references/narration-and-time.md`、`references/prose-realization-and-revision.md`。

### 《红楼梦》（程甲本）第二十九、三十二回：解释差异与人物知识

- **版本**：曹雪芹《红楼梦》程甲本维基文库文本：[第二十九回](https://zh.wikisource.org/zh-hans/紅樓夢（程甲本）/二十九)、[第三十二回](https://zh.wikisource.org/zh-hans/紅樓夢（程甲本）/三十二)。具体句子与段落只按程甲本，避免与其他版本混引。
- **第二十九回复核位置**：页面正文第 130–147 段。第 130 段贾母觉得眼前的赤金点翠麒麟眼熟，宝钗说史湘云另有一只、比眼前这只小；眼前这只不是湘云那只。黛玉评论宝钗留心他人所带之物。第 131 段宝玉听说湘云有一只较小的麒麟后把眼前这只揣起，又向黛玉相让；叙述明写宝玉怕旁人看出他留下眼前这只，也写他因黛玉看他而“心里没意思”，但没有直接说明黛玉见这只麒麟时已把它理解为“金玉”旧事的延续。第 133–135 段分别写出宝玉认为黛玉奚落自己、想到“你心里竟没我了”，以及黛玉想到“金玉相对”并猜测宝玉提及此事时的心情；叙述者概括二人求近而生疏远，随后写摔玉与哭。第 142–147 段写两人都没去薛蟠生日及各自后悔的缘由；文本没有写他们事先约好同行，不能概括为“失约”。
- **第三十二回复核位置**：页面正文第 120–126 段。黛玉由“你放心”及既有共同经历推知宝玉未出口的意思；受话者知识与关系使简短话语产生具体影响，眼泪和动作进入对方可观察的反应。后续谈话也展示人物所知和受话人是否理解并不相同。
- **本轮补充复核**：页面行 121 写黛玉听见宝玉说她从未说过“混账话”后，又喜、又惊、又悲、又叹；各自理由分别牵连她对知己关系、“金玉”之论、父母早逝与病弱的理解。她想到相见时自觉无味，擦泪抽身回去。这里只作不同在意与解释各有材料的例证，不将四种情绪变成固定步骤或配额；不声称两人此处已完成相见或发生未明写的对话。
- **本地适配**：关键交锋需分别追踪双方掌握的材料、愿望、解释、策略和行动后果；写对白时判断当前受话者凭什么听出或误听其意。引用原作时区分可见动作、叙述明示的内心与本地分析，不把分析性阐释冒充文本事实。该原作展示解释差异如何与行为相连，不证明所有关系戏都应靠误会推进，也不把短台词普遍解释成潜台词公式。
- **二手补充**：王彬《附录：试论〈红楼梦〉中转述语的变异模式》，中国作家网（2021-11-05），[文章](https://www.chinawriter.com.cn/n1/2021/1105/c441448-32274936.html)，第 5 节举第二十九回宝玉后悔等语句讨论叙述话语与人物内语相接。本条用于提醒中文叙述中过渡可能连续、不能只凭英文时态分类；其术语不直接变成通用生成模板。
- **运行位置**：交锋方法见 `references/story-design-and-reader-expectation.md`；信息声音见 `references/narration-and-time.md` 与 `references/prose-realization-and-revision.md`。

## 理论与练习来源

### Forster：时间故事、因果情节与读者记忆

E. M. Forster, *Aspects of the Novel*（1927），Project Gutenberg：[全文](https://www.gutenberg.org/files/70492/old/70492-h/70492-h.htm)。第五章 “The Plot” 页 128–132（在线行 439–453）区分按时序发生的 story 与强调因果联系的 plot，讨论读者怎样凭记忆重排前文线索；第二章 “The Story” 页 45–46（在线行约 171）以故事在日出时中断说明“接下来会怎样”的好奇。

第三、四章 “The People” 区分人物塑造的复杂度。第四章用读者能否被人物的行为意外地说服来讨论圆形人物。此处用于人物方法的复杂度和可信变化判断；人物是否成长依本作目的决定。

时间次序、因果组织与回读线索用于现有的因果与承诺处理。其适用程度服从作品的组织方式；五项宏观功能另见 McKee。

### McKee：五项宏观功能的来源与小说迁移边界

- **来源归属**：Robert McKee, *Story: Substance, Structure, Style, and the Principles of Screenwriting*（1997），Part III “Story Design”；作者网站[本书书目页](https://mckeestory.com/books/story)。仓库既有剧本 Reference 将“激励事件、进展纠葛、危机、高潮、结局”明确归于 McKee《Story》Part III；其追溯信息另记于[剧本方法来源台账](../laohu-script/SOURCES.md)。本轮没有独立核阅 McKee 全书，也不据书目页声称核过未访问章节的原文。
- **原来源范围**：这是 McKee 的故事设计方法，原本在编剧/戏剧构思语境中提出；五项描述的是故事层面的组织功能，不是其章节、场次或媒介格式。
- **本地适配**：小说故事 Ref 只在完整、由行动因果推进的作品需要宏观组织时使用五项功能，按结尾承诺倒推人物选择、事件与前置条件，再以读者实际接收顺序正向复核。功能可跨章或在同章并存；观察、联想、回忆等结构按自身组织逻辑展开。章纲的实际组织条件见小说主文第二步。
- **运行位置**：`references/story-design-and-reader-expectation.md` 的宏观因果弧构造与复核方法。该 Reference 已包含全部运行动作和例外，不要求运行时读取剧本专项。

### Sanderson：阅读承诺与人物能显在页面上的选择

- **情节**。作者的 [2025 年写作课第 2 讲](https://www.brandonsanderson.com/blogs/blog/brandon-sandersons-2025-guide-to-plot-lecture-2)区分全书的 Big P 与章节中的 Little p，并整理 Promise、Progress、Payoff。书中早期可从基调、故事、人物及结构建立承诺。进展可以是读者新获得的信息、人物理解或冲突的改变。
- **人物**。[2025 年写作课第 6 讲](https://www.brandonsanderson.com/blogs/blog/customizing-your-character-brandon-sandersons-writing-lecture-6-2025)分别讨论动机、表达动机的个性和指导选择的价值观。讲课另分幕后构思与读者实际看到的内容，讨论相对稳定的标志性人物，也用对话场合和关系反差说明声口。所核内容为作者官网公开讲义。
- **本地适配**。按全书到章节检查承诺、进展和回应；通过人物在关键情境中的真实选项、代价、措辞和感知验证设计。开篇四种切口、五维人物判断及声口切换方法按本地任务实施。

### Swain 与 Bickham：行动场与后续反应

- **Dwight V. Swain**。*Techniques of the Selling Writer*（[University of Oklahoma Press 1981 年版](https://www.oupress.com/9780806111919/techniques-of-the-selling-writer/)）。出版社页核对书名、作者及场景组织的范围；Swain 本人在 *Creating Characters: How to Build Story People*（[书目与目录](https://books.google.com/books/about/Creating_Characters.html?hl=en&id=Nn--PW9KluMC&output=html_text)）“The Dynamics of Disbelief” 中讨论场景内的行动和反应、场景之间的过渡和决断，并明指前书有更详细说明。这可核场景和后续单元的实质区别；本次未通读 *Techniques*。
- **Jack M. Bickham**。*Scene & Structure*（Writer’s Digest Books，原版 1993，[原版书目](https://books.google.com/books/about/Scene_and_Structure.html?id=SPlAPgAACAAJ)，[1999 年版出版社页](https://www.penguinrandomhouse.com/books/632064/elements-of-fiction-writing---scene-and-structure-by-jack-bickham/)）。核对第 7 章对后续段的情绪、思考、决定和行动的安排，第 8、9 章对篇幅、强度、略去部分和调整顺序的讨论。此为特定小说创作方法，章节组织仍服从作品本身。
- **本地适配**。处理关键行动怎样接到下一次选择时，写清当前目标、阻力和改变条件的结果，再按需要表现冲击、权衡与决定。带代价的胜利、同场承接、延后处理以及安静段落的取舍由本作决定。运行见 `references/story-design-and-reader-expectation.md`。

### Maass：微张力所在的阅读尺度

Donald Maass 的 [Writer’s Digest 访谈](https://www.writersdigest.com/improve-my-writing/breakout-novelist-interview)和[三人访谈](https://www.writersdigest.com/improve-my-writing/donald-maass-james-scott-bell-and-christopher-vogler-discuss-story-structure)将微张力定位为逐行的阅读体验，有别于全书冲突和场景层目标；同时核对其 [*The Fire in Fiction* 出版社书目](https://www.penguinrandomhouse.com/books/632971/the-fire-in-fiction-by-donald-maass/)。本地在需要牵引的段落用顾忌、知识差、时间压力或言行差异落到下一句及下一动作；对应四种开篇切口为本地编排。体裁、段落任务及读者反应仍由作品和验证决定。

### Genette：次序、速度、重复与叙述位置

Gérard Genette, *Narrative Discourse: An Essay in Method*，Jane E. Lewin 英译（Cornell University Press，1980），[目录和书目](https://books.google.com/books/about/Narrative_Discourse.html?id=yEPuQg7SOxIC)。Order、Duration、Frequency、Mood、Voice 分别始于第 33、86、113、161、212 页。Duration 中以事件时长与叙述展开的关系区分不同速度；Mood 涉及距离及聚焦，Voice 关乎讲述行为及讲述者位置。本文所用的慢放、概述、省略、停顿、重复和切换信号是成文动作；特别是 Stretch 的中文操作说明属于本地组织，未将这一组标签当作 Genette 原书的逐项分类。运行见 `references/narration-and-time.md`。

### Hemingway：依据已知材料作留白

Ernest Hemingway, *Death in the Afternoon*（1932），[Distributed Proofreaders Canada 电子原作](https://www.fadedpage.com/books/20150366/html.php)第十六章结尾，及 George Plimpton 访谈 [“The Art of Fiction No. 21”](https://www.theparisreview.org/interviews/4825/the-art-of-fiction-no-21-ernest-hemingway)（*The Paris Review* 第 18 期，1958 年春）。书中对比作者了解材料时主动省略，与作者缺少知识留下的空洞；访谈用 *The Old Man and the Sea* 的取材谈及这个原则。冰山的比例是比喻。

本地适配为保留可让读者感到后果的材料，作者掌握潜在关系并给足当前必要事实。阻力、习俗、代价的设定递送，及同一意象在后文改义、一处细节兼顾几项作用，均属本地创作方法。

### 「仁、义、礼、智、信」与本地人物方法

[《白虎通德论》卷八〈情性〉](https://ctext.org/bai-hu-tong/xing-qing/zhs)可核这组传统名称。本项目按具体文化语境借作虚构人物价值维度。偏重、缺失与异化的选择检查，身体与心理、身份教养、过往经历三个取材方向，观察滤镜、叙述声音坐标及用词与换声样本，都是本地操作化方法。它们用于决定人物会怎样看、怎样说、如何选择，无心理测评含义。运行见 `references/character-and-voice.md`。

### Cohn：意识的叙述呈现方式

Dorrit Cohn, *Transparent Minds: Narrative Modes for Presenting Consciousness in Fiction*（Princeton University Press, 1978）。[JSTOR 书页](https://www.jstor.org/stable/j.ctvzxx9vd)展示摘要、目录与部分可见章节；目录分别列 “Psycho-Narration” 第 1 章 pp. 21–57、“Quoted Monologue” 第 2 章 pp. 58–98、“Narrated Monologue” 第 3 章 pp. 99–140，以及 “Retrospective Techniques” 第 4 章 pp. 143–172；[Google Books 书目页](https://books.google.com/books/about/Transparent_Minds.html?id=4Og9DwAAQBAJ)可复核书名和目录。本次只核页面摘要、目录和可见节选，不宣称通读全书。

本地使用边界：这些章节区分帮助写作者比较叙述者报告、人物直接内语、人物措辞/评价渗入叙述时的信息权限与距离；中文实现须读具体上下文，不把英文人称、时态或分类名称机械替换为中文标点规则。

### McHale：话语形式、人物声音与语境

Brian McHale, “Speech Representation,” *Living Handbook of Narratology*。该条目创建于 2011 年、修订于 2014 年 4 月 8 日：[原文](https://www-archiv.fdm.uni-hamburg.de/lhn/node/47.html)。本次核读 Definition、Explication，以及 Voices/Minds 部分（网页行 43–59、84–96、105–116）：文章把直接话语、间接话语与自由间接话语作为呈现言语/部分意识的形式，同时指出离散形式不足以穷尽话语与意识呈现；具体语境会影响声音效果，自由间接话语也可能与叙述者声音叠合并形成反讽，不自动意味着更贴近或更同情。

本地适配：将这些形式当作供写作者辨认和选择的工具，结合读者需要的心理内容、念头形成过程或言行差异判断、叙述知识权限、人物声口、速度与距离取舍。中文的自由间接话语须由称谓、评价、疑问、指示、语序和上下文连续定位，不能机械删除“她想”或增加问号生成。此执行链是本地适配，不归称为 McHale 的原步骤或公式。

### Le Guin：朗读与声音检查

Ursula K. Le Guin, *Steering the Craft: A 21st-Century Guide to Sailing the Sea of Story*，修订版（2015）。[作者官网](https://www.ursulakleguin.com/steering-the-craft)介绍十章内容从语言声音到句子、视角等并含经典范例/练习；第一章声音练习的授权节选见 [Lit Hub](https://lithub.com/a-writing-lesson-from-ursula-k-leguin/)。本次核对官网与节选，没有声称通读全书。朗读用于听辨声音与节奏；将其应用于中文时由本作语域和中文读者判断词语搭配，不能把英语音韵建议当作汉语证据。视角互换和句序调整属于本地修订动作，不归为 Le Guin 的具体练习。

### Ribó：叙述与语言术语边界

Ignasi Ribó, *Prose Fiction: An Introduction to the Semiotics of Narrative*（Open Book Publishers, 2019）：[出版社总页](https://www.openbookpublishers.com/books/10.11647/obp.0187)、[第 5 章 Narration](https://www.openbookpublishers.com/books/10.11647/obp.0187/chapters/10.11647/obp.0187.05)、[第 6 章 Language](https://www.openbookpublishers.com/books/10.11647/obp.0187/chapters/10.11647/obp.0187.06)。出版社摘要确认相关章分别涉及叙述/聚焦/展示与小说语言。本次访问其在线章节 PDF 遭遇页面防护，不能据此声称核阅具体章内论证，也不把它作为新增局部动作的直接背书；本地规则依现有叙述/语言方法及其他可核原作完成。

## 方法映射与适用边界

| 来源 | 本地动作或规则 | 范围边界 | 使用位置 |
|---|---|---|---|
| Dickens *Our Mutual Friend* + Dickens Project 出版资料 | 维护系列长线、阶段结账、当前发布结果和跨期读者必要旧知；阶段结果推出下一任务 | 停更回归为现代本地适配，不归因于 Dickens；不要求每期留下悬崖式结尾 | `skills/laohu-novel-serial/SKILL.md` |
| Doyle “Silver Blaze” | 事实/调查者/读者三线、竞争解释、区分证据、揭晓回核 | 侦查型解谜专用；知识受限不自动等于不公平 | `skills/laohu-novel-suspense/SKILL.md` |
| 鲁迅《故乡》 | 当前注意触发记忆，选择会改变当下判断的旧经验，重评后返回当前层 | 不强加一人称回忆声口或固定配额 | `skills/laohu-novel-interior/SKILL.md`、叙述/词句段 Ref |
| 鲁迅《孔乙己》及程甲本《红楼梦》29/32回 | 通过完整话轮、说听双方知识、来源标记和空间细节写出可观察的关系与判断 | 不把单字、动作或潜台词做成公式 | 故事、叙述/时间、词句段 Reference |
| Forster、Cohn、McHale、Le Guin、Ribó | 深化已有因果、意识呈现、叙述和声音判断 | 保留原作/理论范围；Cohn 仅核书目、摘要、目录与可见节选，McHale 仅核指定条目部分；不声称方法全新或效果已由本项目验证 | 现有 Reference 与父级执行路由 |
| McKee《Story》Part III 五项宏观功能 | 将既有故事设计法改写为小说完整因果弧的条件性构造/复核工具 | 不移植剧本分幕格式，也不用于非因果作品或充当章纲数字默认 | `references/story-design-and-reader-expectation.md` |
| Sanderson 讲义、Forster 人物讨论及本地价值维度 | 从关键选择找能进入页面的动机、性格和价值，按作用决定人物复杂度和声口记录 | 按作品需要发展或保持角色，五维与声口坐标是本地适配 | `references/character-and-voice.md`、`references/story-design-and-reader-expectation.md` |
| Swain、Bickham、Maass | 在行动结果与后续反应间选择篇幅，必要时从局部拉扯牵起下文 | 场/章依真实需要组织，允许停留与开放；四种开篇切口为本地操作 | `references/story-design-and-reader-expectation.md` |
| Genette、Hemingway、《故乡》 | 调整叙述时间、保留可支撑留白的事实，或用意象回返改变理解 | 文学论述及原作提供选择依据，正文可懂性和具体效果须回读 | `references/narration-and-time.md`、`references/prose-realization-and-revision.md` |

- 来源、版本与原作个案用于追溯方法和解释适用边界，不能证明本地规则会被准确调用或产出高质量小说；实际行为、读者/编辑接受和媒介效果须另行验证。

## 从运行文件移出沉淀的学术文献边界与原作细读考据

为保持日常运行文件聚焦于可执行的创作方法、消除上下文噪声与重复科普，将原散落在 `references/story-design-and-reader-expectation.md`、`references/narration-and-time.md` 以及三个内部三级子 Skill 中的学术文献边界与原作细读考据统一沉淀于本节；各来源证据强度不同（小说理论与创作评论用于结构取舍，心理学研究提供有限情境下的机制假说），实际效果仍须以作品目标与真实读者反馈核验。

### 学术文献与心理学研究边界（原载 `references/story-design-and-reader-expectation.md` 与 `references/narration-and-time.md`）

| 文献出处 | 原载运行文件与涉及概念 | 适用与禁用边界 |
|---|---|---|
| Aristotle, *Poetics* | `references/story-design-and-reader-expectation.md`：情节统一、事件因果、逆转与发现 | 原论针对古希腊悲剧；仅在本作需要连贯行动或可信转变时借用事件依概率/必然性相接的检查，不推导所有小说必有单一主线、逆转、发现或悲剧结局。 |
| E. M. Forster, *Aspects of the Novel*（1927） | `references/story-design-and-reader-expectation.md`：“The Story” 与 “The Plot” 区分 | 时序故事与因果情节是两项独立判断，非因果组织按本作逻辑处理；人物复杂度另见 `references/character-and-voice.md`。 |
| Ignasi Ribó, *Prose Fiction: An Introduction to the Semiotics of Narrative*（2019） | `references/story-design-and-reader-expectation.md`（第 2 章 Plot、第 4 章 Characterisation）；`references/narration-and-time.md`（第 5 章 Narration、第 6 章 Language） | 借事件关系、情节机制、冲突、悬念/惊讶、人物塑造、叙述/聚焦及讲述/呈现作分析坐标；在线 PDF 遇防护未核章内论证，具体判断与操作步骤均为本地成文适配。 |
| Brandon Sanderson, “2025 Guide to Plot (Lecture #2)”（2025） | `references/story-design-and-reader-expectation.md`：Big P / Little p 与 Promise–Progress–Payoff | 方法按需选用，不代表每部小说都由情节驱动，也不规定本项目章纲格式。 |
| Gérard Genette, *Narrative Discourse: An Essay in Method*（1980） | `references/narration-and-time.md`：order / duration / frequency / mood / voice 五变量 | 用于拆清时序、时距、频率、聚焦与声音变量，不压成单一视角或普遍公式；具体诊断步骤与 Stretch 中文操作为本地适配。 |
| George Loewenstein, “The Psychology of Curiosity: A Review and Reinterpretation,” *Psychological Bulletin* 116(1)（1994）, 75–98 | `references/story-design-and-reader-expectation.md`：信息缺口理论与好奇心 | 把好奇心联系到意识到缺少某项有意义信息；不等于任意隐瞒都能引起读者好奇。 |
| Moritz Lehne & Stefan Koelsch, “Toward a general psychological model of tension and suspense,” *Frontiers in Psychology* 6（2015）, 79 | `references/story-design-and-reader-expectation.md`：冲突/不稳定、结果不确定与有情感意义的预期结果 | 原文指出不确定性作用尚有争论；仅作解释与设计的分析框架，不是保证某种读者反应的公式。 |
| Dolf Zillmann & Jennings Bryant, “Viewer’s moral sanction of retribution in the appreciation of dramatic presentations,” *Journal of Experimental Social Psychology* 11(6)（1975）, 572–582 | `references/story-design-and-reader-expectation.md`：报应力度与公平评价 | 研究材料为儿童观看童话式视听故事，不可直接概括成人小说读者，也不证明读者必然偏好惩罚；受害事实、因果责任、后果尺度与人物代价检查属本地适配，作品选宽恕、拒绝报复、悲剧或未完成正义时依其立场处理。 |
| Dorrit Cohn, *Transparent Minds*（1978） | 原 `skills/laohu-novel-interior/SKILL.md`：psycho-narration / quoted monologue / narrated monologue | 为消除与 `references/prose-realization-and-revision.md` 重复科普，从 `laohu-novel-interior` 剥离；中文实现依上下文辨认声音归属，不照搬英文人称或时态标记。 |

### 原作细读考据归档（原载 `references/` 与三个内部三级子 Skill）

- **Dickens《Our Mutual Friend》作者后记**（原载 `skills/laohu-novel-serial/SKILL.md`）：John Harmon/Rokesmith 身份细线从早期暗示起跨十九个月分期连载持续工作，直至终局解释；证明长线可跨阶段运作且分期/卷/书并非同一单位，不要求每期悬崖结尾。跨期与停更复更时在当前行动中自然唤回旧事实属面向现代发布间隔的本地适配，不归因于 Dickens。
- **Arthur Conan Doyle《The Adventure of Silver Blaze》（1892）**（原载 `skills/laohu-novel-suspense/SKILL.md`）：前段借放狗建立常态基线，后段警探报告夜间狗未叫，Holmes 将缺席识别为异常并提出熟人接近假说，再结合其他物证与人物条件筛选排除。可迁移的是“立基线→显异常→竞争解释→后续证据筛选→揭晓回读”的推理顺序，不要求套用具体意象或结尾长篇讲解。
- **鲁迅《故乡》**（原载 `skills/laohu-novel-interior/SKILL.md` 与 `references/narration-and-time.md`）：第一人称回望中，叙述者由船中所见阴晦故乡进入回忆，因说不出旧乡具体美景而重估悲凉来自景物还是告别心绪；后由母亲提闰土召回童年画面并借当下答话返场；再由成年闰土的称呼使少年记忆受到现实修正。可迁移的是“当下锚点→相应旧经验→比较重评→当下或意识落点”的运动链，不强加一人称回忆语调或段落顺序。
- **鲁迅《孔乙己》**（原载 `references/narration-and-time.md`）：第 128 段背地传闻、第 136 段酒客转述被打折腿与猜测结局、第 137 段叙述者亲见伤后现身却未亲见致伤过程、第 138 段掌柜欠账记录只能证明欠款不能证明生死、第 140 段句末在“大约”与“的确”间保留推想张力。分别界定亲见、转述、记录与推论各自支持的结论，不将不确定材料拆成硬证据。
- **程甲本《红楼梦》第二十九、三十二回**（原载 `references/story-design-and-reader-expectation.md`）：第二十九回第 130–131、133–135、142–147 段展示麒麟相让、宝玉怕人看出留下麒麟及“心里没意思”、二人各自内心猜度与摔玉，以及二人未去薛蟠生日（原文未写约好同行，不可误称“失约”）；第三十二回展示黛玉听闻宝玉说她从未说过“混账话”后又喜、又惊、又悲、又叹各自牵连知己、“金玉”之论、父母早逝与病弱材料并自觉“无味”拭泪离去。仅作区分原文明示与分析解释、追踪多重在意与交锋后果的个案，不将四种情绪或误会摔物做成固定配额。
- **汉语流水句、白话说话感与反生理器官标签（v4 表皮迭代补充来源，2026-11-22）**：吸收吕叔湘《现代汉语八百词》及申小龙《中国文化语言学》关于汉语意合流水句与虚词润滑机理、汪曾祺/老舍关于生活白话说话感与雅俗提炼论述、中文通俗类型小说（金庸、忘语、猫腻等）九成顺溜白话打底配呼吸感打斗的实践经验，以及欧美/中文写作理论对“Show Don't Tell”机械异化为生理器官标签（body-part labeling / somatic cliché）与四字压缩播报腔的纠偏原则，落实于 `SKILL.md`、`references/prose-realization-and-revision.md`、`references/character-and-voice.md` 与 `references/narration-and-time.md`。
- **词性舒展、情绪冲突表演与剧情快节奏融情（v5 终极表皮迭代补充来源，2026-11-22）**：吸收现代汉语 `发+单音节形容词` 弱化含蓄构式与双音节口语舒展语用分析、心理学情绪构成理论（刺激评估→主观体验→表达→行动倾向）与汉语口语情绪词分类、戏剧冲突表演理论（对立行动冲动当面碰撞）及通俗小说节奏论（剧情对话与人物弧光主导、环境只为衬托情绪或卷入冲突服务、去静物罗列），落实于 `SKILL.md`、`references/prose-realization-and-revision.md`、`references/narration-and-time.md` 与 `references/character-and-voice.md`。
- **造梦框架同步升维与规则排毒（v6 迭代补充来源，2026-11-23）**：吸收新版《万能造梦框架》规则反污染律（去固定锚词串与长禁词表、改写底层判断原理）、题材质地适配与立意海拔轻自检（明确保留网文与通俗类型鲜活情绪色彩、不生搬纯文学文雅）、爆点区与铺垫区两阶段解耦、核心母体以少总多、2–3 处黄金记忆锚点（最优创新假说与认知空白）、80/20 素底点睛、高阶对标校准及放飞—修疤物理分离，落实于 `SKILL.md`、`pre-design.md`、`story-design-and-reader-expectation.md`、`character-and-voice.md` 与 `prose-realization-and-revision.md`。
- **增量校准、去僵化与补强（v7 迭代记录，2026-11-24）**：对照新版 `AGENTS.md` 与《万能造梦框架》做非破坏性增量校准——① 在 `SKILL.md` 与 `pre-design.md` 补齐跨题材小说北极星、需求穿透与三态辩证裁决（严守锁定项与红线）、修复 `pre-design.md` 工序二丢失的“情感支点”定义并明确章纲人话拍板与设计包白描防污染；② 解除商业快节奏对含蓄/静观/写实篇章的一刀切覆盖，为环境描写（死静物摆摊 vs 活场景毛边）、词性舒展（打音量萎缩根因不打自然汉语词面）、生理描写、时代语境及母体/记忆锚点体量补清 A×B 共存边界；③ 将跨文件重复 3–4 遍的表皮防错统一收口至 `prose-realization-and-revision.md` §5，真正落实放飞—扫疤物理分离，并补入蓄压不泄底、去心理咨询室式塑料通透与长篇章节波形/声口防漂移。三个内部子技能与 `evals.json` 原样保留。
- **表皮双轨呈现、小说易读排版与盲测细部补强（v7.1 迭代记录，2026-11-24）**：对接《万能造梦框架》新增第 14 条“表皮双轨呈现与格式契约律”及人类阅稿反馈，落实于 `SKILL.md`、`pre-design.md` 与 `prose-realization-and-revision.md`——① 明确中间态审纲/比较的结构化扫读版式与用户固定格式契约；② 确立小说正文高易读排版（引号极度克制只归位直接对白与极少数逐字引语，拟声词/招式/称呼/牌匾一律裸写；对白独立成段、换人或切入长动作与场景必换行，短段错落呼吸）；③ 吸收 v7 隔离盲测暴露的 3 处细部缺口（轻短篇直写松绑 `laohu-analysis` 减负、前置补齐行业实权边界与第三方铁证核对、扫疤补齐回怼原话核对与目标篇幅控量）。
