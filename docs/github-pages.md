# GitHub发布准备

此分支在v0.3基础上添加根目录网页文件和.nojekyll。源码、数据、浏览器计算模块及装卸流程均复用v0.3。

准备命令：python scripts/prepare_github_pages.py。

上传目标：用户指定的 https://github.com/websafarikyle-hue/urban-loading-planner 。仅写入该项目仓库。

网页启用：[Settings → Pages](https://github.com/websafarikyle-hue/urban-loading-planner/settings/pages) → Deploy from a branch → main → /(root) → Save。当前连接没有启用 Pages 的管理接口，这一步由仓库管理员在页面完成。

预期网页地址：https://websafarikyle-hue.github.io/urban-loading-planner/ 。该地址仅在部署成功后可用，不能把源码已上传视为网页已上线。公开网页无需 ChatGPT 登录。`index.html`、CSS、JS、Worker 与数据都使用项目内的相对路径，支持 `/urban-loading-planner/` 项目路径。在线地图和道路服务失败时，已有缓存仍可计算。

GitHub Free的免费Pages要求公开仓库；私有仓库可保留源码，并继续使用已发布的工作台：https://urban-flow-kyle-mobile.cuddlylynx2.chatgpt.site 。电脑和手机使用相同链接。若赛事要求私有代码，应保留私有仓库，并独立使用当前网页演示。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Windows验证：文件读写和Node子进程通信明确使用UTF-8，避免中文Windows默认GBK造成数据读取和接口错误。修正后32项Python测试及新/旧前端逻辑检查通过。

上传时保留远端现有提交，先创建独立功能分支，禁止强推。仅收到目标仓库地址并成功写入后，才能标记GitHub上传完成；仅Pages实际成功部署后，才能提供其已发布URL。
