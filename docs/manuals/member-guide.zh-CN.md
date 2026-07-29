# WaveSparks Community Member 使用手册

版本：1.0
审计基线：2026-07-29 代码与当前界面
适用角色：受邀加入 WaveSparks Community 的普通成员

> 本手册描述当前代码已经实现的行为。不同组织的名称、活动、成员和内容会不同；页面中的英文按钮名以实际部署为准。

## 1. 产品定位与完整旅程

WaveSparks Community 是一个邀请制、以 Space 为边界的成员社区。Member 可以维护一份跨 Space 共用的个人资料，在获授权的 Main Space 或 Event Space 中浏览内容、发现成员、获得匹配建议、发起介绍并沉淀资源。

一名 Member 的典型生命周期是：

1. 收到组织发出的邀请邮件。
2. 用邀请对应的已验证邮箱注册或登录 Clerk 账号。
3. 接受邀请，连接本地成员身份。
4. 完成全局 Profile。
5. 从 My Spaces 进入自己有权限的 Main Space 或 Event。
6. 浏览 Feed、People、Knowledge 和 Opportunities，并参与互动。
7. 为每个 Space 单独设置 Matching intent，查看匹配并反馈。
8. 发起或回应 Introduction；接受后交换联系方式。
9. 持续维护资料、通知、收藏和跨 Space 的历史记录。
10. 活动结束、权限移除、账号暂停或删除时，按本手册的数据规则退出。

![My Spaces 首页](../assets/manuals/member-home.png)

## 2. 开始前需要知道的权限模型

登录成功并不等于可以进入所有 Space。访问某个 Space 必须同时满足：

- 社区账号状态为 `connected`；
- 组织已经给该成员分配这个 Space；
- 该 Space 权限状态为 `active`；
- Space 当前是 `upcoming`、`active` 或 `ended`。

`draft` 和 `archived` Space 对 Member 不可见。`ended` Event 会出现在 Past events，但当前版本仍可浏览和互动；只有归档后才不可访问。

Main Space 也采用邀请制。只被邀请参加某个 Event 的成员会看到锁定的 Main Space 卡片，但不会自动获得 Main Space 权限。用户不能自行申请加入、RSVP、签到、退订活动或离开 Space。

每个 Space 的 Feed、关注、收藏、匹配意图、匹配结果和 Introduction 相互隔离。全局 Profile 和账号级 Inbox 则跨 Space 使用。

## 3. 接受邀请、注册与登录

### 3.1 正常流程

1. 打开来自 WaveSparks/Clerk 的邀请邮件。
2. 在 7 天有效期内点击邀请链接。
3. 如果尚未登录，按页面提示注册或登录。
4. 使用与邀请完全一致、且已经验证的邮箱。
5. 系统验证后将邀请标记为已接受，并把 Clerk 身份连接到本地 Member 账号。
6. 首次进入时完成 Profile；以后可从组织首页选择 Space。

邀请链接使用一次性随机 token。打开后，token 会被换成约 15 分钟有效的安全交接 Cookie，并从地址栏移除。请勿把邀请链接转发给别人。

### 3.2 邀请失败的处理

- “Invalid”：链接不完整或 token 无效，请重新从原邮件打开。
- “Expired”：邀请超过 7 天，请联系 Admin 重发。
- “Inactive”：邀请已经接受或被撤销，请改用正常登录，或联系 Admin。
- 邮箱不匹配：退出当前 Clerk 账号，再用受邀邮箱登录；该邮箱必须已验证。
- 账号冲突：当前身份已连接另一份本地记录，需要 Admin 核对，用户不能靠更换显示邮箱绕过。
- Pending 页面：账号仍未连接、已暂停或已停用，请联系 Admin。

生产环境不会只凭“邮箱看起来相同”自动绑定本地成员。不要新建另一个邮箱相似的账号尝试接管邀请。

### 3.3 登出与账号凭证

从右上角账号菜单退出。密码、MFA、活动会话和 Clerk 账号操作由线上 Clerk 配置决定，具体菜单可能随部署设置变化。应用当前没有单独的本地 Account Settings 页面。

## 4. My Spaces 与活动生命周期

组织首页将可访问空间分为：

- Main Space：长期社区空间；是否可用取决于 Admin 是否授权。
- Your events：`upcoming` 或 `active` 的 Event Space。
- Past events：`ended` 的 Event Space。

Event 是带日期与生命周期的社区空间，不是票务或日程产品。当前没有报名名额、支付、签到、直播、课程完成或证书流程。

如果只有一个可访问 Space，部分旧链接可能自动转到该 Space；如果有多个 Space，旧的组织级 Feed/Matches 链接通常回到 My Spaces，请先选择正确的 Space。

## 5. 完成全局 Profile

Profile 在所有 Space 之间共用，可分步保存草稿。未完成时仍能进入 Home，并浏览部分 Feed、Knowledge、Opportunities 和已有 Introduction；但 People、Matches、发帖、评论、关注、收藏、请求或回应 Introduction 等互动会受限。

### 5.1 四个资料步骤

1. About you
   - 姓名、Preferred name、显示方式、头像；
   - 城市、国家、时区、学校或公司、当前身份；
   - Headline、Bio；
   - LinkedIn、GitHub、个人网站和 X 链接。
2. Interests & experience
   - 关注的问题、Current focus、技术与产品经验；
   - Skills、行业和问题领域标签；
   - 项目或创业公司名称、阶段、简介与进展。
3. Connections
   - 正在寻找什么、可以提供什么；
   - 目标角色、需要的帮助、可贡献内容；
   - 时间投入、开始时间、远程偏好、地区、会面频率和理想匹配。
4. Contact & preferences
   - 工作与沟通偏好；
   - Introduction 联系邮箱；
   - WhatsApp，以及是否在接受 Introduction 后分享；
   - 是否接受新的 Introduction。

![Profile 设置](../assets/manuals/member-profile-setup.png)

### 5.2 完成标准

系统将以下七项同时满足视为 Profile complete：

- Preferred name；
- Headline；
- Bio；
- Current focus；
- 至少一种 Looking for 类型；
- 至少一个 Skill tag；
- 有效的 Introduction email。

全局 Profile 的完成标准要求填写 Looking for，即使计划在所有 Space 中关闭 Matching；这是当前版本限制。

### 5.3 格式与隐私

- 外部链接必须是 HTTP/HTTPS。
- 头像可用公开图片链接，或上传 JPG、PNG、WebP，最大 2MB。
- 上传头像使用公开的资源 URL，不要上传敏感证件或私密图片。
- Introduction email 只用于介绍联系，不会修改 Clerk 登录邮箱。
- Profile 中的公开社交链接会在当前 Space 的成员资料中展示。

## 6. Space 导航与 Feed

进入 Space 后，顶部导航包括 Feed、People、Matches、Knowledge、Opportunities 和 Introductions。Space 切换器用于确认当前上下文；发布、关注、收藏和匹配都只作用于当前 Space。

![Space Feed](../assets/manuals/member-feed.png)

### 6.1 发布内容

当前支持：

- General update；
- Question；
- Resource；
- Announcement；
- Opportunity；
- Looking for cofounder；
- Looking for mentor。

帖子可包含标题、正文、标签、相关角色、项目说明、外部链接预览、`@mention` 和图片。普通 Member 发布 Opportunity 时来源固定为 participant/member，不能选择 organizer 或 mentor 来源。

主要限制：

- 标题最多 160 字符；正文最多 10,000 字符；
- General update 可不填标题，其他类型需要标题；
- 帖子至少要有正文或图片；
- 最多 4 张图片，每张最大 5MB，仅 JPG、PNG、WebP；
- 图片会被处理成 WebP，最长边不超过 2400px，最大 40MP；
- 评论最多 2,000 字符；
- 最多提及 10 位不同成员、20 个 mention 范围。

### 6.2 浏览与互动

Feed 支持搜索，并可按内容类型、标签、作者身份、创业阶段、行业和所需角色筛选。关注关系和匹配关系会影响推荐内容。

Member 可以：

- 打开帖子详情并评论；
- 关注或取消关注作者；
- 收藏或取消收藏帖子；
- 从帖子作者发起 General introduction。

当前不支持帖子或评论的自助编辑/删除、点赞或表情、举报、屏蔽、静音和站内私信。内容需要处理时联系 Admin。

## 7. People 与成员发现

People 目录只显示当前 Space 中账号已连接、权限为 active 且 Profile 已完成的成员。

可搜索姓名、项目和技能，并按 affiliation、Approved Mentor、创业阶段、行业、需求和技能筛选。成员详情可能展示：

- 显示名称、Affiliation、Headline、Bio、Current focus；
- 项目、创业阶段、经验、Skills、Needs 和行业标签；
- LinkedIn、GitHub、网站、X 等公开链接；
- Approved Mentor 的专长、可辅导阶段、Offering、可用性和容量。

关注只在当前 Space 生效，可影响 Feed 推荐，但不会向对方发送“被关注”通知。

## 8. 为每个 Space 配置 Matching

Matching 需要三层条件：全局 Profile complete、当前 Space 开启 Matching、当前 Space 的个人 intent 完成并 opt-in。

### 8.1 设置 intent

在 Matches 页面填写：

- Current goal；
- Looking for；
- What I can offer；
- Include me in match suggestions。

要成为完整 intent，必须有 Current goal，并且 Looking for 或 Offer 至少一项。每个 Space 都要单独配置，Main Space 的设置不会复制到 Event。

### 8.2 理解匹配结果

![Member 匹配页](../assets/manuals/member-matches.png)

匹配卡显示 0–100 Fit index、解释和共同标签。它表达当前资料与意图的匹配程度，不是合作成功概率、信用评分、声望或服务质量评价。

候选人还需满足：

- 当前 Space active；
- 账号 connected、Profile complete；
- 接受 Introduction；
- 当前 Space intent complete 且 Matching opt-in；
- 没有被 Admin 隐藏，也没有被你标为 Not relevant。

可以按匹配类型筛选，并标记 Helpful 或 Not relevant。Not relevant 必须选择原因，之后结果会隐藏，并在后续重算中保留 dismissal。当前反馈不会立即自动训练公开权重。

## 9. Introduction 全流程

Introduction 是平台内的受控介绍请求，不是聊天线程。可从以下入口发起：

- People 中的成员资料；
- Matches 中的匹配卡；
- 帖子作者。

如果目标是 Approved Mentor 且接受辅导，可从资料或 mentor match 发起 Mentoring introduction；从帖子作者发起的始终是 General introduction。

### 9.1 发起请求

1. 确认双方都在当前 Space 且资料已完成。
2. 选择 General 或允许时的 Mentoring。
3. 填写 Purpose、Note 和 Suggested opening message。
4. 提交后进入 pending。

同一组织内，同一对成员同时最多有一个 pending 请求，不论方向、类型或来源 Space。请求方当前不能自行撤回。

### 9.2 回应与联系方式

请求状态为：`pending → accepted`、`pending → declined`，系统也可能把无效请求变成 `expired`。

- Pending：等待接收方处理，双方不能借此获得新 Space 权限。
- Accepted：参与双方可看到 Introduction email；仅在对方选择接受后共享时显示 WhatsApp。
- Declined：保留结果，不公开对方联系信息。
- Expired：账号、Mentor 资格、Space 权限或其他前置条件失效后可能发生。

Admin 出于社区运营需要可以查看成员资料中的联系方式，所以“接受后才显示”是对普通参与双方的可见性规则，不代表对组织管理员隐藏。

平台没有内置私信、视频会议或日历。接受后请使用双方同意的外部渠道沟通。

## 10. Knowledge、Opportunities、收藏与通知

### 10.1 Knowledge

Knowledge 包括 Library 和 Saved，可搜索 Resource、Featured、活跃讨论及自己收藏的帖子。收藏按 Space 隔离。

### 10.2 Opportunities

Opportunities 汇总机会类内容，可按 organizers、participants、mentors 或全部来源查看，并使用与 Feed 类似的详细筛选。普通 Member 只能以 participant/member 来源发布。

### 10.3 Inbox 与站内通知

当前通知包括：

- Membership approved；
- Introduction requested、accepted、declined；
- Manual introduction；
- Admin note；
- Post mention、Comment mention。

没有关注通知、点赞通知、推送通知或每日摘要。Resend 未配置时，站内通知仍会创建，但产品邮件会跳过；初始邀请邮件由 Clerk 发送。

Global Inbox 会保留 accepted/declined 的 Introduction 历史，即使后来失去原 Space 权限；pending/expired 通常只在仍可访问来源 Space 时显示。内容 mention 只有在内容仍可见且用户仍有该 Space 权限时有效。

## 11. 活动结束、权限变化与账号状态

### 11.1 Event ended 或 archived

- `ended`：进入 Past events，当前仍可发帖、评论、匹配和 Introduction。
- `archived`：Member 不可见、不可访问。

### 11.2 Space 权限被移除

对应 Space 的 Feed、People、Matches、Knowledge 和 Opportunities 不再可访问。已 accepted/declined 的 Introduction 历史可能仍在 Global Inbox 中；它不会恢复 Space 权限。

### 11.3 账号暂停或停用

`suspended`、`deprovisioned` 或尚未连接的账号会进入 Pending，不能继续使用社区。联系 Admin 核对邀请或账号状态。

## 12. 删除账号与数据保留

应用当前没有自助删除本地社区账号、导出个人数据、暂停账号或退出 Space 的按钮。若线上 Clerk 允许用户删除身份，只有 Clerk 成功发送 `user.deleted` Webhook 后，本地数据才会执行匿名化。

匿名化结果包括：

- 名称改为 Former member；
- 清空头像、简介、地点、项目、匹配、辅导和联系方式等资料；
- 移除 Clerk ID，账号变为 deprovisioned/suspended；
- 删除邀请、账号关联、匹配、关注、收藏和通知；
- Pending Introduction 过期并移除联系信息；
- 已发布帖子和评论不删除，作者显示为 Former member。

如果需要删除、导出或离开 Space，请先联系组织 Admin，并确认 Clerk 身份删除和本地 Webhook 是否都已完成。

## 13. 隐私与安全建议

- Profile、帖子和互动只向当前 Space 的有效参与者开放。
- 社交链接会显示在成员资料中，请只填写希望分享的链接。
- Introduction email 和获授权的 WhatsApp 只在请求 accepted 后向参与双方显示；Admin 仍可为运营查看资料。
- 头像使用公开资源 URL；帖子图片通过需鉴权的应用接口读取。
- 不要转发邀请链接，不要在帖子中发布密码、API key、身份证件或其他敏感数据。
- 收到异常 Introduction 或内容时，当前没有举报入口，请联系 Admin。

## 14. 当前版本明确不提供

- 积分、等级、排行榜、可获得的徽章或证书；
- Event RSVP、票务、签到、直播或课程完成流程；
- 站内私信、群聊、语音或视频会议；
- 帖子/评论自助编辑与删除、点赞、举报、屏蔽或静音；
- 自助申请加入/退出 Space，自助撤回 Introduction；
- 个人数据导出或本地账号删除；
- 独立 Project 管理、任务管理或协作看板。

页面上的标签、Approved Mentor 标识、生命周期状态和 Profile completion 百分比是分类或进度，不是奖励积分或成就徽章。

## 15. 常见问题

### 为什么我登录后仍在 Pending？

本地邀请可能未成功接受、邮箱未验证、账号被暂停或已停用。重新从有效邀请进入；仍失败时让 Admin 检查账号状态，不要重复注册。

### 为什么我能看 Feed，却不能评论或关注？

未完成 Profile 时允许浏览部分内容，但互动受限。补齐七个完成字段后重试。

### 为什么我在一个 Event 的匹配设置没有出现在另一个 Space？

Matching intent、结果、反馈、关注和收藏均按 Space 隔离，这是设计行为。

### 为什么活动结束后还能发帖？

`ended` 当前代表 Past event，不是只读；Admin 归档后才会停止访问。

### 为什么接受 Introduction 后没有站内聊天？

平台负责发现、请求、同意和联系方式交换，后续沟通在双方选择的外部工具中完成。

### 邮件没有收到怎么办？

先检查站内 Inbox 和垃圾邮件。邀请邮件由 Clerk 发送，其他产品通知通常由 Resend 发送；让 Admin 分别在对应平台检查状态。

## 16. 快速自检清单

- 我用邀请中的、已验证的邮箱登录。
- 我能在 My Spaces 看到正确的 Space。
- Profile 七个必填条件都完成。
- Introduction email 正确，公开社交链接适合展示。
- 每个需要匹配的 Space 都单独填写 intent 并 opt-in。
- 我理解 Fit index 只是匹配程度。
- 接受 Introduction 前不会在帖子中公开敏感联系方式。
- 我知道权限、内容处理或账号删除需要联系 Admin。
