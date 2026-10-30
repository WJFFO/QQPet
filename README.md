# QQ宠物 (QQPet)

一个复刻经典「QQ宠物」桌面宠物的跨平台桌面应用，基于 **Electron + Vue 3** 构建。宠物以 **Flash（Ruffle）动画** 呈现，支持领养、喂食、清洁、养宠升级、商店购物、迷你小游戏与宠物档案等部分养成玩法。


## 项目设置

### 安装依赖

```bash
npm install
```

### 启动开发

```bash
npm run dev
```


### 生产构建 / 打包

```bash
# 仅构建（out/ 目录，不打包安装包）
npm run build

# 打包安装包
npm run build:win    # Windows（NSIS 安装器）
npm run build:mac    # macOS（dmg）
npm run build:linux  # Linux（AppImage / snap / deb）
```

> Windows 安装包产物位于 `dist/`，如 `qqpet-<版本>-setup.exe`（向导式安装，可选择安装目录并创建桌面快捷方式）。
