# M5 Termux 部署文档验收清单

- [x] `packages/server/docs/termux.md` 存在
- [x] 文档包含「前置条件」章节（Android 版本、Termux 版本来源说明）
- [x] 文档包含「环境安装」章节（pkg update / nodejs-lts / node:sqlite 验证）
- [x] 文档包含「获取代码」章节（git clone）
- [x] 文档包含「首次启动」章节（npm install / build / dev:server / 浏览器访问）
- [x] 文档包含「后台运行」章节（termux-wake-lock + nohup/tmux）
- [x] 文档包含「自启动」章节（Termux:Boot + ~/.termux/boot/ 脚本）
- [x] 文档包含「备份与恢复」章节（在线 VACUUM INTO + 离线 cp + 迁移）
- [x] 文档包含「环境变量」表（PORT/HOST/DATA_DIR/DB_PATH/PUBLIC_BASE_URL/LOG_LEVEL/ALLOWED_ORIGINS/LLM_*/ADMIN_TOKEN）
- [x] 文档包含「常见问题」章节（端口占用、手机改设置、后台被杀、二维码扫不出、node:sqlite 不可用）
- [x] 文档包含「已知限制」说明（wake-lock、Android 后台策略、聚会时接电源建议）
- [x] README.md 新增「部署」段，指向 Termux 文档链接
- [x] 文档不引用未实现的功能
- [x] 文档中文显示正常，无乱码
- [x] 文档中的 shell 命令语法正确（sh 兼容）
