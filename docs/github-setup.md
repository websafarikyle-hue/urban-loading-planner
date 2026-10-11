# 远程仓库接入状态
用户已连接 GitHub，账号 websafarikyle-hue；连接器可读写已有仓库。
当前连接器未提供新建仓库接口；浏览器创建入口与 Codex 预览面板返回会话错误；本机现有 Git 凭据认证检查未成功。
因此未创建远程 urban-loading-planner，也未向其他仓库写入此项目。

## 接入步骤
在 https://github.com/new 创建名为 urban-loading-planner 的私有空仓库，不初始化 README/.gitignore/license。
如果解压的项目包含 .git，Git 历史已就绪：
~~~sh
git remote add origin https://github.com/websafarikyle-hue/urban-loading-planner.git
git push -u origin main
git push -u origin feat/demo-v01
~~~
通过 GitHub 打开 feat/demo-v01 到 main 的 PR；提交说明包含 docs/validation.md。
如远程含已有提交，先拉取检查并整合历史，不强制覆盖。
