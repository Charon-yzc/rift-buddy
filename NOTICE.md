# 素材、数据和依赖来源

开黑搭子是免费社区工具，与 Riot Games、腾讯或下列数据站点没有隶属或赞助关系。

- 英雄、装备、符文、召唤师技能等素材与游戏内容属于 Riot Games。离线资料主要来自 [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) 和 [CommunityDragon](https://www.communitydragon.org/)；使用时须遵守对应权利与规则。参见 Riot 的 [Legal Jibber Jabber](https://www.riotgames.com/en/legal)。
- 常规出装和海克斯配置参考 [OP.GG](https://op.gg/lol)。缓存保留 `sourceUrl`、资料版本和获取日期；外部站点不对本工具的推荐负责。来源资料版本可能与国服不同。
- 社区组合的具体参考来源保存在 `src/core/catalog-data.json` 的各条 `sources` 字段中。规则设计与整理说明不作为统计胜率证据，也不表示来源作者认可本工具。
- Electron 及其运行依赖遵循随二进制提供的许可与声明。开发依赖版本记录在 `package.json`、`pnpm-lock.yaml`。
- 连接助手使用未修改的 Node.js 运行时；对应的 [Node.js 许可与第三方声明](assets/node-LICENSE.txt) 随源码和发布包提供。

仓库未声明统一开源许可证。公开查看源码和免费下载使用程序，并不改变上述第三方内容的权利归属。
