# AI 助教 - 智能学习

独立的 AI 助教应用，支持上传图片/文字，AI 自动分类并生成练习题。

## 在线地址

https://master.ai-tutor-es0.pages.dev

## 本地开发

```bash
npm install
SILICONFLOW_API_KEY=sk-xxx npm run server   # 终端1：启动后端
npm run dev                                  # 终端2：启动前端
```

## 部署

### 方式一：命令行部署（已配置）

```bash
npm run deploy:cf
```

### 方式二：GitHub Actions 自动部署

1. 把工作流文件推送到 GitHub：

```bash
# 先获取 workflow 权限
gh auth refresh --hostname github.com -s workflow
# 然后推送
git push
```

2. 或者手动在 GitHub 网页设置：
   - 打开 https://github.com/fanfuzi/ai-tutor/settings/secrets/actions
   - 创建 Secret `CF_API_TOKEN`，值用以下命令获取：
   ```bash
   grep oauth_token ~/.wrangler/config/default.toml | cut -d'"' -f2
   ```
   - 然后把 `.github/workflows/deploy.yml` 通过 GitHub 网页手动上传到仓库

### 方式三：Cloudflare Dashboard 自动部署

1. 打开 https://dash.cloudflare.com/ → Pages → ai-tutor
2. 点击 "Set up build" → "Connect to Git" → GitHub
3. 选择 `fanfuzi/ai-tutor` 仓库
4. 构建配置：`npm run build` / `dist` / 分支 `master`
5. 保存后自动部署
